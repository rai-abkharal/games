import { getAnalytics, type Analytics } from '@react-native-firebase/analytics';
import { postAnalyticsEvent, type AnalyticsPayload } from '../api/analyticsApi';
import { STORAGE_KEYS } from '../config/env';
import { useCatalogStore } from '../store/catalogStore';
import type { AnalyticsEventName } from '../types/game';
import { uuid } from '../utils/misc';
import { readJson, readString, writeJson, writeString } from './storage';

const MAX_QUEUE = 50;
const now = () => Date.now();

/**
 * GA4 hard limits. Exceeding any of them does not fail — the SDK silently
 * truncates or drops, which is how a release build ends up with events that
 * look fine in code and arrive in the console missing half their parameters.
 * So they are enforced here, loudly in development and quietly in release.
 */
const GA4 = {
  eventNameChars: 40,
  paramNameChars: 40,
  paramValueChars: 100,
  paramsPerEvent: 25,
} as const;

/** Reported once per distinct problem so a hot loop cannot flood the log. */
const warned = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (!__DEV__ || warned.has(key)) return;
  warned.add(key);
  console.warn(`[analytics] ${message}`);
}

/**
 * The Firebase instance, or null when the native SDK is not there at all.
 *
 * This used to swallow the reason. A missing `google-services.json`, a
 * mismatched applicationId or a Firebase module that failed to initialise all
 * present as "no analytics, ever", and silently returning null made that
 * indistinguishable from a healthy app with nothing to report. The failure is
 * still non-fatal — analytics must never take the game down — but it is now
 * visible in development and recorded for `analyticsHealth()`.
 */
let firebaseError: string | null = null;

function getFirebase(): Analytics | null {
  try {
    const instance = getAnalytics();
    if (instance) firebaseError = null;
    return instance ?? null;
  } catch (error) {
    firebaseError = error instanceof Error ? error.message : String(error);
    warnOnce(
      'firebase-missing',
      `Firebase Analytics is unavailable (${firebaseError}). Events will not reach GA4. ` +
        'Check that google-services.json matches the applicationId and that @react-native-firebase/app is linked.',
    );
    return null;
  }
}

/** What the app knows about its own analytics pipeline. Used by Settings/dev tooling. */
export function analyticsHealth(): { available: boolean; error: string | null; sessionId: string } {
  return {
    available: getFirebase() !== null,
    error: firebaseError,
    sessionId: analytics.getSessionId(),
  };
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
 * The identity every game event carries. Resolved from the catalogue so an
 * Admin Panel rename or a new version shows up without a client release, and
 * attached centrally so no call site can forget `game_id` or `game_name` —
 * which is the pair every report in GA4 is going to group by.
 */
export interface GameIdentity {
  game_id: string;
  game_name: string;
  game_version: string;
  category: string;
  item_id: string;
  item_name: string;
  page_title: string;
  page_location?: string;
}

export function gameIdentity(gameId: string, fallbackTitle?: string, fallbackCategory?: string): GameIdentity {
  const game = useCatalogStore.getState().getGame(gameId);
  const title = game?.title || fallbackTitle || gameId;
  const entryUrl = game?.entryUrl || '';
  return {
    game_id: gameId,
    game_name: title,
    game_version: game?.version || '',
    category: game?.category || fallbackCategory || '',
    item_id: gameId,
    item_name: title,
    page_title: title,
    ...(entryUrl ? { page_location: entryUrl } : {}),
  };
}

/**
 * Converts a game title or ID into a clean, compliant GA4 event name.
 * Rules:
 *  - Must start with an alphabetic character ('game_')
 *  - Alphanumeric and underscores only ([a-zA-Z0-9_])
 *  - Maximum 40 characters
 * Examples:
 *  - 'Snake' -> 'game_snake'
 *  - 'Car Racing' -> 'game_car_racing'
 *  - 'Puzzle Classic' -> 'game_puzzle_classic'
 */
export function toGameEventName(titleOrId: string): string {
  const clean = titleOrId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34);
  return `game_${clean || 'unknown'}`;
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
  /**
   * One id per app process, attached to every event. GA4 has its own session
   * concept with a 30-minute timeout; this is the app's own, which is what
   * makes it possible to reconstruct a single sitting's swipe path exactly.
   */
  private readonly sessionId = uuid();
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
  /**
   * Games this session has already counted an impression for. A page is
   * rendered, frozen, re-rendered and swiped back to many times in a sitting;
   * an impression is about reach, so it is counted once per game per session.
   */
  private impressions = new Set<string>();
  /**
   * `gameId:buildId:attempt` for every load already reported. A WebView that
   * remounts, or a React re-render that replays an effect, must not turn one
   * load into three `game_load` events.
   */
  private reportedLoads = new Set<string>();

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

    // User-scoped identity. Set once, before the first event of the session, so
    // every event that follows is attributed to the right user in GA4.
    const fb = getFirebase();
    if (!fb) return;
    await this.settle('setUserId', fb.setUserId(this.clientId));
    await this.settle('setUserProperty:client_id', fb.setUserProperty('client_id', this.clientId));
  }

  getClientId(): string {
    return this.clientId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setUserId(userId: string): void {
    const fb = getFirebase();
    if (!fb) return;
    void this.settle('setUserId', fb.setUserId(userId));
    void this.settle('setUserProperty:player_id', fb.setUserProperty('player_id', userId));
  }

  setUserProperty(name: string, value: string): void {
    const fb = getFirebase();
    if (!fb) return;
    void this.settle(`setUserProperty:${name}`, fb.setUserProperty(name, value));
  }

  /**
   * Tracks user focusing / selecting a game in the feed or tabs.
   *
   * `item_id`/`item_name` are the GA4 *recommended* names and are what the
   * built-in content reports read, so they stay. The `game_*` identity is
   * attached alongside for the custom reports.
   */
  onGameSelect(gameId: string, fallbackTitle?: string, category?: string): void {
    const identity = gameIdentity(gameId, fallbackTitle, category);
    this.logFirebaseEvent('game_select', {
      ...identity,
      item_id: gameId,
      item_name: identity.game_name,
      content_type: 'game',
      category: category || identity.category || 'arcade',
    });
  }

  /**
   * The player reached a game in the feed. Reach, not engagement: counted once
   * per game per session, whether or not the game ever finished loading.
   */
  onGameImpression(gameId: string, fallbackTitle?: string, category?: string, position?: number): void {
    if (this.impressions.has(gameId)) return;
    this.impressions.add(gameId);
    this.logFirebaseEvent('game_impression', {
      ...gameIdentity(gameId, fallbackTitle, category),
      feed_position: position ?? -1,
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

    const identity = gameIdentity(gameId, fallbackTitle, category);
    this.activeGameId = gameId;
    this.activeGameTitle = identity.game_name;
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

    // 1. Firebase Analytics: game_start for app-wide rollups
    this.logFirebaseEvent('game_start', {
      ...identity,
      category: category || identity.category || 'arcade',
      play_count: currentPlays,
      attempt_number: attempts,
    });

    // 2. Primary Game-Named Event so each game appears directly in Firebase Console -> Events
    const gameEventName = toGameEventName(identity.game_name || gameId);
    this.logFirebaseEvent(gameEventName, {
      ...identity,
      category: category || identity.category || 'arcade',
      play_count: currentPlays,
      attempt_number: attempts,
    });

    // User properties for audience segmentation & reporting
    this.setUserProperty('last_played_game', identity.game_name);
    this.setUserProperty('last_played_game_id', identity.game_id);

    // 2. Dual send to backend analytics API
    this.send('game_start', gameId, identity.game_name);
  }

  /**
   * One event per load attempt, carrying where the time actually went.
   *
   * Deliberately one event rather than the five it replaces
   * (load_start/load_complete/load_error/game_ready/first_frame): GA4 reports
   * on events, and five events per game open would both bloat the taxonomy and
   * make "how long did this take" a join across four of them. Here every stage
   * is a parameter on the same row, so a single exploration answers it.
   *
   * `source` separates the two cases that matter: a build served from the
   * device, and one pulled over the network.
   */
  onGameLoad(
    gameId: string,
    detail: {
      fallbackTitle?: string;
      category?: string;
      outcome: 'ready' | 'error' | 'timeout';
      source: 'local' | 'network';
      /** Monotonic key so a remount cannot report the same load twice. */
      loadKey: string;
      downloadMs?: number;
      webviewMs?: number;
      htmlMs?: number;
      engineMs?: number;
      firstFrameMs?: number;
      totalMs: number;
      error?: string;
    },
  ): void {
    if (this.reportedLoads.has(detail.loadKey)) return;
    this.reportedLoads.add(detail.loadKey);
    // Bounded: a long sitting swipes through hundreds of pages, and this set
    // exists to dedupe a remount, not to remember the whole session.
    if (this.reportedLoads.size > 256) {
      this.reportedLoads = new Set(Array.from(this.reportedLoads).slice(-128));
    }
    this.logFirebaseEvent('game_load', {
      ...gameIdentity(gameId, detail.fallbackTitle, detail.category),
      outcome: detail.outcome,
      source: detail.source,
      download_ms: Math.round(detail.downloadMs ?? 0),
      webview_ms: Math.round(detail.webviewMs ?? 0),
      html_ms: Math.round(detail.htmlMs ?? 0),
      engine_ms: Math.round(detail.engineMs ?? 0),
      first_frame_ms: Math.round(detail.firstFrameMs ?? 0),
      total_ms: Math.round(detail.totalMs),
      ...(detail.error ? { error_message: detail.error } : {}),
    });
  }

  /**
   * One event per finished or abandoned bundle download. Progress ticks are
   * deliberately not events: at four a second they would be the loudest thing
   * in the property and say nothing a completed download's byte count and
   * duration do not.
   */
  onGameDownload(
    gameId: string,
    detail: {
      fallbackTitle?: string;
      outcome: 'complete' | 'failed';
      bytes?: number;
      durationMs?: number;
      error?: string;
      retryInMs?: number;
    },
  ): void {
    const bytes = detail.bytes ?? 0;
    const durationMs = detail.durationMs ?? 0;
    this.logFirebaseEvent('game_download', {
      ...gameIdentity(gameId, detail.fallbackTitle),
      outcome: detail.outcome,
      bytes,
      duration_ms: Math.round(durationMs),
      // Saves every report from having to divide two other columns.
      kbps: durationMs > 0 ? Math.round(bytes / durationMs) : 0,
      ...(detail.error ? { error_message: detail.error } : {}),
      ...(detail.retryInMs ? { retry_in_ms: Math.round(detail.retryInMs) } : {}),
    });
  }

  /**
   * Tracks game over / match failure.
   */
  onGameOver(gameId: string, fallbackTitle?: string, score = 0, stats = '', level?: number, overrideDurationSec?: number): void {
    const identity = gameIdentity(gameId, fallbackTitle || this.activeGameTitle);
    const duration = overrideDurationSec !== undefined ? overrideDurationSec : this.durationSeconds();
    const attempts = this.attemptCounters.get(gameId) || 1;
    const resolvedLevel = level ?? this.activeLevels.get(gameId);

    // 1. Firebase Analytics: game_fail & game_over
    this.logFirebaseEvent('game_fail', {
      ...identity,
      score,
      level: resolvedLevel !== undefined ? resolvedLevel : 0,
      duration_seconds: duration,
      attempt_number: attempts,
      result: 'failed',
    });

    if (resolvedLevel !== undefined) {
      this.logFirebaseEvent('level_end', {
        ...identity,
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

    this.send('game_over', gameId, identity.game_name, {
      score,
      durationSeconds: duration,
      extra,
    });
  }

  /**
   * Tracks game / level completion (win/pass).
   */
  onGameCompleted(gameId: string, fallbackTitle?: string, score = 0, level = 1, overrideDurationSec?: number): void {
    const identity = gameIdentity(gameId, fallbackTitle || this.activeGameTitle);
    const duration = overrideDurationSec !== undefined ? overrideDurationSec : this.durationSeconds();
    const attempts = this.attemptCounters.get(gameId) || 1;

    // 1. Firebase Analytics: game_complete
    this.logFirebaseEvent('game_complete', {
      ...identity,
      score,
      level,
      duration_seconds: duration,
      attempt_number: attempts,
      result: 'passed',
    });

    // Level-specific analytics event
    this.logFirebaseEvent('level_end', {
      ...identity,
      level_number: level,
      success: 1,
      result: 'passed',
      score,
      duration_seconds: duration,
    });

    // 2. Backend Analytics
    this.send('game_completed', gameId, identity.game_name, {
      score,
      level,
      durationSeconds: duration,
    });
  }

  /**
   * Tracks level start for level-based games.
   */
  onLevelStart(gameId: string, fallbackTitle?: string, level = 1): void {
    const identity = gameIdentity(gameId, fallbackTitle || this.activeGameTitle);
    this.activeLevels.set(gameId, level);
    const attempts = this.attemptCounters.get(gameId) || 1;

    this.logFirebaseEvent('level_start', {
      ...identity,
      level_number: level,
      attempt_number: attempts,
    });
  }

  /**
   * Tracks user exiting, navigating away, or backgrounding while playing.
   */
  onGameExit(
    gameId: string,
    fallbackTitle?: string,
    exitReason = 'navigated',
    score = 0,
    completed = false,
    overrideDurationSec?: number,
  ): void {
    if (this.activeGameId !== gameId) return;
    const identity = gameIdentity(gameId, fallbackTitle || this.activeGameTitle);
    const duration = overrideDurationSec !== undefined ? overrideDurationSec : this.durationSeconds();

    // 1. Firebase Analytics: game_exit
    this.logFirebaseEvent('game_exit', {
      ...identity,
      duration_seconds: duration,
      exit_reason: exitReason,
      score,
      abandoned: !completed && (exitReason === 'swiped_away' || exitReason === 'app_paused'),
    });

    // 2. Backend Analytics
    this.send('game_exit', gameId, identity.game_name, {
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
    this.logFirebaseEvent('game_action', {
      ...gameIdentity(gameId, fallbackTitle || this.activeGameTitle),
      action_name: actionName,
      action_value: value !== undefined ? String(value) : '',
    });
  }

  /** Screen view tracking using both native logScreenView and event fallback. */
  onScreenView(screenName: string, screenClass = 'ReactNavigation'): void {
    const fb = getFirebase();
    if (fb && typeof fb.logScreenView === 'function') {
      void this.settle('logScreenView', fb.logScreenView({ screen_name: screenName, screen_class: screenClass }));
    }
    this.logFirebaseEvent('screen_view', {
      screen_name: screenName,
      screen_class: screenClass,
      page_title: screenName,
    });
  }

  /**
   * Tracks when a player navigates to / views a specific game screen & web page.
   * - Updates native Firebase current screen via logScreenView (shows in "Pages and screens")
   * - Logs GA4 page_view with web page title & URL so web page analytics show up properly!
   */
  onGameScreenView(gameId: string, fallbackTitle?: string, entryUrl?: string): void {
    const identity = gameIdentity(gameId, fallbackTitle);
    const fb = getFirebase();
    if (fb && typeof fb.logScreenView === 'function') {
      void this.settle(
        'logScreenView:game',
        fb.logScreenView({
          screen_name: identity.game_name,
          screen_class: 'GameWebView',
        }),
      );
    }
    this.logFirebaseEvent('screen_view', {
      ...identity,
      screen_name: identity.game_name,
      screen_class: 'GameWebView',
      page_title: identity.game_name,
    });
    this.logFirebaseEvent('page_view', {
      ...identity,
      page_title: identity.game_name,
      ...(entryUrl ? { page_location: entryUrl } : {}),
    });
  }

  onAdImpression(gameId: string, fallbackTitle?: string): void {
    const identity = gameIdentity(gameId, fallbackTitle);
    this.logFirebaseEvent('ad_impression', {
      ...identity,
      ad_format: 'interstitial',
    });
    this.send('ad_impression', gameId, identity.game_name, { extra: { ad_format: 'interstitial' } });
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

  /**
   * Awaits a Firebase promise so a rejection is handled rather than becoming an
   * unhandled rejection. Failures are reported in development and swallowed in
   * release: a network blip inside the analytics SDK must never be something
   * the player can feel, and the SDK already persists and retries events of its
   * own accord.
   */
  private async settle(what: string, promise: Promise<unknown> | undefined): Promise<void> {
    if (!promise || typeof promise.then !== 'function') return;
    try {
      await promise;
    } catch (error) {
      warnOnce(`fb:${what}`, `${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Normalises one event's parameters against GA4's limits before they are
   * handed to the SDK, because the SDK's own response to breaking them is to
   * drop the parameter without a word — in release, where nobody is watching.
   */
  private sanitizeParams(eventName: string, params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [rawKey, rawValue] of Object.entries(params)) {
      if (rawValue === undefined || rawValue === null) continue;
      if (count >= GA4.paramsPerEvent) {
        warnOnce(`params:${eventName}`, `${eventName} has more than ${GA4.paramsPerEvent} parameters; the rest are dropped.`);
        break;
      }
      const key = rawKey.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, GA4.paramNameChars);
      if (key !== rawKey) {
        warnOnce(`param-name:${eventName}:${rawKey}`, `${eventName}.${rawKey} is not a legal GA4 parameter name; sent as "${key}".`);
      }
      let value = rawValue;
      if (typeof value === 'boolean') {
        // GA4 stores numbers and strings; a boolean arrives as the string
        // "true"/"false", which is unusable in a numeric report.
        value = value ? 1 : 0;
      } else if (typeof value === 'string') {
        const maxLen = key === 'page_location' ? 1000 : GA4.paramValueChars;
        if (value.length > maxLen) {
          warnOnce(`param-value:${eventName}:${key}`, `${eventName}.${key} is longer than ${maxLen} characters and was truncated.`);
          value = value.slice(0, maxLen);
        }
      }
      out[key] = value;
      count++;
    }
    return out;
  }

  /**
   * The one place an event reaches Firebase. Every event picks up the session
   * id and a client timestamp here, so no call site can omit them, and the
   * result is awaited rather than dropped on the floor.
   */
  private logFirebaseEvent(name: string, params: Record<string, unknown>): void {
    const fb = getFirebase();
    if (!fb) return;
    const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, GA4.eventNameChars);
    const payload = this.sanitizeParams(sanitizedName, {
      ...params,
      session_id: this.sessionId,
      event_ts: now(),
    });
    try {
      void this.settle(`logEvent:${sanitizedName}`, fb.logEvent(sanitizedName, payload as Record<string, any>));
    } catch (error) {
      // A throw here (rather than a rejection) means the SDK refused the call
      // outright — a malformed name the sanitiser missed, or a dead module.
      warnOnce(
        `logEvent-throw:${sanitizedName}`,
        `logEvent("${sanitizedName}") threw: ${error instanceof Error ? error.message : String(error)}`,
      );
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
          // Expected offline. The queue is persisted below and retried on the
          // next send; this is the backend pipeline only — Firebase does its
          // own buffering and needs no help from here.
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
