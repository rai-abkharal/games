import { postAnalyticsEvent, type AnalyticsPayload } from '../api/analyticsApi';
import { STORAGE_KEYS } from '../config/env';
import type { AnalyticsEventName } from '../types/game';
import { uuid } from '../utils/misc';
import { readJson, readString, writeJson, writeString } from './storage';

const MAX_QUEUE = 50;
const now = () => Date.now();

/**
 * Port of GameAnalyticsManager. Same events, same parameters, same
 * de-duplication rules (a game_start for the already-active game is ignored,
 * switching games emits a game_exit with exit_reason=swiped_away).
 *
 * Delivery is fire-and-forget; failed sends are queued (bounded) and retried
 * on the next successful connection so short offline spells don't lose data.
 * Nothing here can throw into UI code.
 */
class AnalyticsService {
  private clientId = '';
  private activeGameId: string | null = null;
  private activeGameTitle = '';
  private gameStartAt = 0;
  private adPauseAt = 0;
  private queue: AnalyticsPayload[] = [];
  private flushing = false;
  private ready: Promise<void>;

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
  }

  getClientId(): string {
    return this.clientId;
  }

  onGameStart(gameId: string, title: string): void {
    if (this.activeGameId === gameId) return;
    if (this.activeGameId) {
      this.onGameExit(this.activeGameId, this.activeGameTitle, 'swiped_away');
    }
    this.activeGameId = gameId;
    this.activeGameTitle = title;
    this.gameStartAt = now();
    this.adPauseAt = 0;
    this.send('game_start', gameId, title);
  }

  onGameOver(gameId: string, title: string, score: number, stats = ''): void {
    this.send('game_over', gameId, title, {
      score,
      durationSeconds: this.durationSeconds(),
      extra: stats ? { stats } : undefined,
    });
  }

  onGameCompleted(gameId: string, title: string, score: number, level: number): void {
    this.send('game_completed', gameId, title, {
      score,
      level,
      durationSeconds: this.durationSeconds(),
    });
  }

  onGameExit(gameId: string, title: string, exitReason = 'navigated'): void {
    if (this.activeGameId !== gameId) return;
    this.send('game_exit', gameId, title, {
      durationSeconds: this.durationSeconds(),
      exitReason,
      extra: { exit_reason: exitReason },
    });
    this.activeGameId = null;
    this.activeGameTitle = '';
    this.gameStartAt = 0;
    this.adPauseAt = 0;
  }

  onAdImpression(gameId: string, title: string): void {
    this.send('ad_impression', gameId, title, { extra: { ad_format: 'interstitial' } });
  }

  /** Time spent inside a full-screen ad must not count as play time. */
  pauseForAd(): void {
    if (this.activeGameId && this.adPauseAt === 0) this.adPauseAt = now();
  }

  resumeAfterAd(): void {
    if (this.adPauseAt > 0) {
      this.gameStartAt += now() - this.adPauseAt;
      this.adPauseAt = 0;
    }
  }

  private durationSeconds(): number {
    if (this.gameStartAt <= 0) return 0;
    const end = this.adPauseAt > 0 ? this.adPauseAt : now();
    return Math.max(0, Math.floor((end - this.gameStartAt) / 1000));
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
