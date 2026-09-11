import { getAnalytics, type Analytics } from '@react-native-firebase/analytics';
import { postAnalyticsEvent, type AnalyticsPayload } from '../api/analyticsApi';
import { STORAGE_KEYS } from '../config/env';
import { useCatalogStore } from '../store/catalogStore';
import type { AnalyticsEventName } from '../types/game';
import { uuid } from '../utils/misc';
import { readJson, readString, writeJson, writeString } from './storage';

const MAX_QUEUE = 50;
const now = () => Date.now();

function getFirebase(): Analytics | null {
  try {
    return getAnalytics();
  } catch {
    return null;
  }
}

/**
 * Universal Game Identity Resolver.
 * Resolves the admin-defined game name dynamically from the catalog (source of truth).
 * If the admin renames a game or uploads a new game from the Admin Panel,
 * this always resolves the live current title without any client-side hardcoding.
 */
export function resolveUniversalGameName(gameId: string, fallbackTitle?: string): string {
  const game = useCatalogStore.getState().getGame(gameId);
  return game?.title || fallbackTitle || gameId;
}

/**
 * Enterprise Centralized Analytics Service.
 * Unifies Firebase Analytics with the backend analytics pipeline.
 *
 * Provides:
 *  - Universal dynamic game naming (Admin Panel source of truth)
 *  - Per-game play counts & session attempt tracking
 *  - High-precision active play duration (deducts background & full-screen ad time)
 *  - Complete lifecycle & level tracking (start, complete, fail, pass, exit, action)
 *  - De-duplication against React re-renders and pager settlement
 */
class AnalyticsService {
  private clientId = '';
  private activeGameId: string | null = null;
  private activeGameTitle = '';
  private gameStartAt = 0;
  private adPauseAt = 0;
  private backgroundPauseAt = 0;
  private totalPausedDurationMs = 0;
  private queue: AnalyticsPayload[] = [];
  private flushing = false;
  private ready: Promise<void>;

  // Per-game attempt counter in current session
  private attemptCounters = new Map<string, number>();
  // Cached play counts loaded from storage
  private playCounts = new Map<string, number>();
  // Current active level per game
  private activeLevels = new Map<string, number>();

  constructor() {
    this.ready = this.hydrate();
  }

  private async hydrate() {
    const [savedId, savedQueue] = await Promise.all([
      readString(STORAGE_KEYS.analyticsClientId),
      readJson<AnalyticsPayload[]>(STORAGE_KEYS.analyticsQueue),
    ]);
    this.clientId = savedId || uuid();
    if (!savedId) writeString(STORAGE_KEYS.analyticsClientId, this.clientId);
    if (Array.isArray(savedQueue)) this.queue = savedQueue.slice(-MAX_QUEUE);
    if (this.queue.length) void this.flush();

    // Initialize Firebase client properties safely
    const fb = getFirebase();
    if (fb) {
      try {
        await fb.setUserId(this.clientId);
        await fb.setUserProperty('client_id', this.clientId);
      } catch {
        /* ignore in environments where native FB is absent */
      }
    }
  }

  getClientId(): string {
    return this.clientId;
  }

  setUserId(userId: string): void {
    const fb = getFirebase();
    if (fb) {
      void fb.setUserId(userId);
      void fb.setUserProperty('player_id', userId);
    }
  }

  setUserProperty(name: string, value: string): void {
    const fb = getFirebase();
    if (fb) {
      void fb.setUserProperty(name, value);
    }
  }

  /**
   * Tracks user focusing / selecting a game in the feed or tabs.
   */
  onGameSelect(gameId: string, fallbackTitle?: string, category?: string): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle);
    this.logFirebaseEvent('game_select', {
      item_id: gameId,
      item_name: gameName,
      content_type: 'game',
      category: category || 'arcade',
    });
  }

  /**
   * Tracks game start / match launch with play count and attempt number.
   */
  async onGameStart(gameId: string, fallbackTitle?: string, category?: string): Promise<void> {
    if (this.activeGameId === gameId && this.gameStartAt > 0) return; // Prevent duplicate starts

    if (this.activeGameId && this.activeGameId !== gameId) {
      this.onGameExit(this.activeGameId, this.activeGameTitle, 'swiped_away');
    }

    const gameName = resolveUniversalGameName(gameId, fallbackTitle);
    this.activeGameId = gameId;
    this.activeGameTitle = gameName;
    this.gameStartAt = now();
    this.adPauseAt = 0;
    this.backgroundPauseAt = 0;
    this.totalPausedDurationMs = 0;

    // Increment and persist play count for this game
    const currentPlays = (this.playCounts.get(gameId) ?? (await this.loadPlayCount(gameId))) + 1;
    this.playCounts.set(gameId, currentPlays);
    void this.savePlayCount(gameId, currentPlays);

    // Track attempt number in this session
    const attempts = (this.attemptCounters.get(gameId) || 0) + 1;
    this.attemptCounters.set(gameId, attempts);

    // 1. Firebase Analytics: game_start
    this.logFirebaseEvent('game_start', {
      game_id: gameId,
      game_name: gameName,
      category: category || 'arcade',
      play_count: currentPlays,
      attempt_number: attempts,
    });

    // 2. Dual send to backend analytics API
    this.send('game_start', gameId, gameName);
  }

  /**
   * Tracks game over / match failure.
   */
  onGameOver(gameId: string, fallbackTitle?: string, score = 0, stats = '', level?: number): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle || this.activeGameTitle);
    const duration = this.durationSeconds();
    const attempts = this.attemptCounters.get(gameId) || 1;
    const resolvedLevel = level ?? this.activeLevels.get(gameId);

    // 1. Firebase Analytics: game_fail & game_over
    this.logFirebaseEvent('game_fail', {
      game_id: gameId,
      game_name: gameName,
      score,
      level: resolvedLevel !== undefined ? resolvedLevel : 0,
      duration_seconds: duration,
      attempt_number: attempts,
      result: 'failed',
    });

    if (resolvedLevel !== undefined) {
      this.logFirebaseEvent('level_end', {
        game_id: gameId,
        game_name: gameName,
        level_number: resolvedLevel,
        success: 0,
        result: 'failed',
        score,
        duration_seconds: duration,
      });
    }

    // 2. Backend Analytics
    const extraData: Record<string, string | number | boolean> = {};
    if (stats) extraData.stats = stats;
    if (resolvedLevel !== undefined) extraData.level = resolvedLevel;
    const extra = Object.keys(extraData).length > 0 ? extraData : undefined;

    this.send('game_over', gameId, gameName, {
      score,
      durationSeconds: duration,
      extra,
    });
  }

  /**
   * Tracks game / level completion (win/pass).
   */
  onGameCompleted(gameId: string, fallbackTitle?: string, score = 0, level = 1): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle || this.activeGameTitle);
    const duration = this.durationSeconds();
    const attempts = this.attemptCounters.get(gameId) || 1;

    // 1. Firebase Analytics: game_complete
    this.logFirebaseEvent('game_complete', {
      game_id: gameId,
      game_name: gameName,
      score,
      level,
      duration_seconds: duration,
      attempt_number: attempts,
      result: 'passed',
    });

    // Level-specific analytics event
    this.logFirebaseEvent('level_end', {
      game_id: gameId,
      game_name: gameName,
      level_number: level,
      success: 1,
      result: 'passed',
      score,
      duration_seconds: duration,
    });

    // 2. Backend Analytics
    this.send('game_completed', gameId, gameName, {
      score,
      level,
      durationSeconds: duration,
    });
  }

  /**
   * Tracks level start for level-based games.
   */
  onLevelStart(gameId: string, fallbackTitle?: string, level = 1): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle || this.activeGameTitle);
    this.activeLevels.set(gameId, level);
    const attempts = this.attemptCounters.get(gameId) || 1;

    this.logFirebaseEvent('level_start', {
      game_id: gameId,
      game_name: gameName,
      level_number: level,
      attempt_number: attempts,
    });
  }

  /**
   * Tracks user exiting, navigating away, or backgrounding while playing.
   */
  onGameExit(gameId: string, fallbackTitle?: string, exitReason = 'navigated', score = 0, completed = false): void {
    if (this.activeGameId !== gameId) return;
    const gameName = resolveUniversalGameName(gameId, fallbackTitle || this.activeGameTitle);
    const duration = this.durationSeconds();

    // 1. Firebase Analytics: game_exit
    this.logFirebaseEvent('game_exit', {
      game_id: gameId,
      game_name: gameName,
      duration_seconds: duration,
      exit_reason: exitReason,
      score,
      abandoned: !completed && (exitReason === 'swiped_away' || exitReason === 'app_paused'),
    });

    // 2. Backend Analytics
    this.send('game_exit', gameId, gameName, {
      durationSeconds: duration,
      exitReason,
      extra: { exit_reason: exitReason, score },
    });

    this.activeGameId = null;
    this.activeGameTitle = '';
    this.gameStartAt = 0;
    this.adPauseAt = 0;
    this.backgroundPauseAt = 0;
    this.totalPausedDurationMs = 0;
  }

  /**
   * Meaningful gameplay action tracking (e.g. hints unlocked, coins, audio toggle, favorite).
   */
  onGameAction(gameId: string, fallbackTitle?: string, actionName = '', value?: string | number): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle || this.activeGameTitle);
    this.logFirebaseEvent('game_action', {
      game_id: gameId,
      game_name: gameName,
      action_name: actionName,
      action_value: value !== undefined ? String(value) : '',
    });
  }

  /** Screen view tracking. */
  onScreenView(screenName: string, screenClass = 'ReactNavigation'): void {
    this.logFirebaseEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass,
    });
  }

  onAdImpression(gameId: string, fallbackTitle?: string): void {
    const gameName = resolveUniversalGameName(gameId, fallbackTitle);
    this.logFirebaseEvent('ad_impression', {
      game_id: gameId,
      game_name: gameName,
      ad_format: 'interstitial',
    });
    this.send('ad_impression', gameId, gameName, { extra: { ad_format: 'interstitial' } });
  }

  /** Time spent inside a full-screen ad must not count as play time. */
  pauseForAd(): void {
    if (this.activeGameId && this.adPauseAt === 0) {
      this.adPauseAt = now();
    }
  }

  resumeAfterAd(): void {
    if (this.adPauseAt > 0) {
      this.totalPausedDurationMs += now() - this.adPauseAt;
      this.adPauseAt = 0;
    }
  }

  /** Time spent while app is backgrounded must not count as play time. */
  pauseForBackground(): void {
    if (this.activeGameId && this.backgroundPauseAt === 0) {
      this.backgroundPauseAt = now();
    }
  }

  resumeAfterBackground(): void {
    if (this.backgroundPauseAt > 0) {
      this.totalPausedDurationMs += now() - this.backgroundPauseAt;
      this.backgroundPauseAt = 0;
    }
  }

  /** Computes accurate gameplay duration in seconds, excluding pauses. */
  private durationSeconds(): number {
    if (this.gameStartAt <= 0) return 0;
    let pauseDelta = this.totalPausedDurationMs;
    if (this.adPauseAt > 0) pauseDelta += now() - this.adPauseAt;
    if (this.backgroundPauseAt > 0) pauseDelta += now() - this.backgroundPauseAt;

    const activeMs = Math.max(0, now() - this.gameStartAt - pauseDelta);
    return Math.floor(activeMs / 1000);
  }

  private logFirebaseEvent(name: string, params: Record<string, any>): void {
    const fb = getFirebase();
    if (!fb) return;
    try {
      // Firebase event naming: max 40 chars, alphanumeric + underscore
      const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
      void fb.logEvent(sanitizedName, params);
    } catch {
      /* ignore */
    }
  }

  private send(
    eventName: AnalyticsEventName,
    gameId: string,
    gameTitle: string,
    fields: Partial<Omit<AnalyticsPayload, 'clientId' | 'eventName' | 'gameId' | 'gameTitle' | 'timestampMs'>> = {},
  ): void {
    void this.ready.then(() => {
      this.queue.push({
        clientId: this.clientId,
        eventName,
        gameId,
        gameTitle,
        timestampMs: now(),
        ...fields,
      });
      if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
      void this.flush();
    });
  }

  private async loadPlayCount(gameId: string): Promise<number> {
    const raw = await readString(`sp.plays.${gameId}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  }

  private async savePlayCount(gameId: string, count: number): Promise<void> {
    await writeString(`sp.plays.${gameId}`, String(count));
  }

  /** Sends queued events in order; stops at the first failure and persists the rest. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const next = this.queue[0];
        try {
          await postAnalyticsEvent(next);
          this.queue.shift();
        } catch {
          break;
        }
      }
    } finally {
      this.flushing = false;
      writeJson(STORAGE_KEYS.analyticsQueue, this.queue, 0);
    }
  }
}

export const analytics = new AnalyticsService();
