import { FEED } from '../config/env';
import type { GameItem } from '../types/game';
import { buildGameEntryUrl } from '../utils/url';
import { LAUNCH_CACHE_BYTES, launchCacheStorage, type LaunchCacheStorage } from './launchCacheStorage';

/**
 * In-memory prefetch of upcoming games' entry documents.
 *
 * The backend serves every game `index.html` with `Cache-Control: no-store`,
 * so the WebView's HTTP cache can never help a page that has not been opened
 * yet. The native app works around this by downloading the next game to disk
 * (GameCacheManager.preloadUpcomingGames) and serving it through
 * shouldInterceptRequest. react-native-webview has no request interception,
 * but a WebView can be handed a document directly (`source.html` +
 * `baseUrl`), which is what this service feeds: when a prefetched game becomes
 * the warm/active page its WebView renders from memory and only the game's
 * own sub-resources (which *are* cacheable) touch the network.
 *
 * Budgeted (bytes, least recently used out first), one download at a time,
 * nearest game first, and silent on failure — a prefetch that fails just
 * means the WebView loads the URL itself, exactly as it would without this
 * service. Documents outside the feed's current window are kept while the
 * budget allows, so swiping back to a game whose WebView was freed does not
 * download its no-store HTML again.
 */
export interface PrefetchedGame {
  html: string;
  /** The cache-busted entry URL: origin for relative assets and `location`. */
  baseUrl: string;
  bytes: number;
}

export interface PrefetchResponse {
  ok: boolean;
  status: number;
  contentLength: number | null;
  text: () => Promise<string>;
}

export type PrefetchFetcher = (url: string, timeoutMs: number, signal: AbortSignal) => Promise<PrefetchResponse>;

export interface PrefetchLimits {
  maxBytes: number;
  budgetBytes: number;
  timeoutMs: number;
  failureBackoffMs: number;
}

interface Entry extends PrefetchedGame {
  usedAt: number;
}

const DEFAULT_LIMITS: PrefetchLimits = {
  maxBytes: FEED.prefetchMaxBytes,
  budgetBytes: FEED.prefetchBudgetBytes,
  timeoutMs: FEED.prefetchTimeoutMs,
  failureBackoffMs: 20_000,
};

const defaultFetcher: PrefetchFetcher = async (url, _timeoutMs, signal) => {
  // The job owns cancellation/timeout through both fetch and response.text().
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'text/html' },
  });
  const length = Number(response.headers.get('content-length'));
  return {
    ok: response.ok,
    status: response.status,
    contentLength: Number.isFinite(length) && length > 0 ? length : null,
    text: () => response.text(),
  };
};

/** Identity of a game build: a re-upload (new updatedAt/sha) invalidates the entry. */
export function prefetchKey(game: Pick<GameItem, 'id' | 'version' | 'updatedAt' | 'sha256' | 'entryUrl'>): string {
  return `${game.id}|${game.version}|${game.updatedAt ?? ''}|${game.sha256 ?? ''}|${game.entryUrl}`;
}

export class GamePrefetcher {
  private readonly entries = new Map<string, Entry>();
  /** The feed's current window (see retain); evicted only after everything else. */
  private protectedKeys = new Set<string>();
  private readonly failedUntil = new Map<string, number>();
  private queue: GameItem[] = [];
  private inflight: { key: string; game: GameItem; cancelled: boolean; controller: AbortController } | null = null;
  private online = true;
  private paused = false;
  private launchKey: string | null = null;
  private savedLaunchKey: string | null = null;

  /** Restore concurrently with profile/catalog reads, before mounting the feed. */
  async restoreLaunch(): Promise<void> {
    try {
      const saved = await this.launchStorage?.read();
      if (!saved || typeof saved.key !== 'string' || typeof saved.html !== 'string' ||
          typeof saved.baseUrl !== 'string' || !saved.html.length) return;
      const bytes = saved.html.length * 2;
      if (bytes > Math.min(LAUNCH_CACHE_BYTES, this.limits.maxBytes, this.limits.budgetBytes)) return;
      this.entries.set(saved.key, { html: saved.html, baseUrl: saved.baseUrl, bytes, usedAt: this.now() });
      this.savedLaunchKey = saved.key;
    } catch { /* Fall back to the normal URL load. */ }
  }

  setLaunchGame(game: GameItem): void { this.launchKey = prefetchKey(game); }

  /** Called only in an explicit game-end window, never from the frame/load callbacks. */
  saveLaunch(): void {
    if (this.paused || !this.launchStorage || !this.launchKey || this.savedLaunchKey === this.launchKey) return;
    const entry = this.entries.get(this.launchKey);
    if (!entry || entry.bytes > LAUNCH_CACHE_BYTES) return;
    const key = this.launchKey;
    this.savedLaunchKey = key;
    void this.launchStorage.write({ key, html: entry.html, baseUrl: entry.baseUrl }).catch(() => {
      if (this.savedLaunchKey === key) this.savedLaunchKey = null;
    });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.cancelInflight(true);
    else this.pump();
  }
  private readonly limits: PrefetchLimits;

  constructor(
    private readonly fetcher: PrefetchFetcher = defaultFetcher,
    limits: Partial<PrefetchLimits> = {},
    private readonly now: () => number = Date.now,
    private readonly launchStorage?: LaunchCacheStorage,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (!online) this.cancelInflight(true);
    else this.pump();
  }

  has(game: GameItem): boolean {
    return this.entries.has(prefetchKey(game));
  }

  get(game: GameItem): PrefetchedGame | null {
    const entry = this.entries.get(prefetchKey(game));
    if (!entry) return null;
    entry.usedAt = this.now();
    return { html: entry.html, baseUrl: entry.baseUrl, bytes: entry.bytes };
  }

  /**
   * Replaces the wish-list. Order is priority: the first eligible game is
   * fetched next. A download for a game no longer wanted is discarded when it
   * completes.
   */
  request(games: GameItem[]): void {
    const wanted = new Map<string, GameItem>();
    for (const game of games) {
      const key = prefetchKey(game);
      if (!wanted.has(key) && this.eligible(game)) wanted.set(key, game);
    }
    this.queue = Array.from(wanted.values());
    if (this.inflight && !wanted.has(this.inflight.key)) this.cancelInflight(false);
    this.pump();
  }

  /**
   * Marks the documents the feed needs soon (live pages + prefetch targets).
   * Everything else stays cached until the byte budget needs the room, and
   * then goes first, least recently used first.
   */
  retain(games: GameItem[]): void {
    this.protectedKeys = new Set(games.map(prefetchKey));
    this.enforceBudget(null);
  }

  clear(): void {
    this.entries.clear();
    this.protectedKeys.clear();
    this.queue = [];
    this.cancelInflight(false);
  }

  stats(): { entries: number; bytes: number; queued: number; inflight: boolean } {
    let bytes = 0;
    for (const entry of this.entries.values()) bytes += entry.bytes;
    return { entries: this.entries.size, bytes, queued: this.queue.length, inflight: this.inflight !== null };
  }

  private eligible(game: GameItem): boolean {
    const key = prefetchKey(game);
    if (this.entries.has(key)) return false;
    if (game.sizeBytes > 0 && game.sizeBytes > this.limits.maxBytes) return false;
    const retryAt = this.failedUntil.get(key);
    if (retryAt !== undefined && retryAt > this.now()) return false;
    return true;
  }

  private cancelInflight(requeue: boolean): void {
    const job = this.inflight;
    if (!job || job.cancelled) return;
    job.cancelled = true;
    if (requeue && !this.queue.some(game => prefetchKey(game) === job.key)) this.queue.unshift(job.game);
    job.controller.abort();
  }

  private pump(): void {
    if (this.inflight || !this.online || this.paused) return;
    const next = this.queue.find(game => this.eligible(game));
    if (!next) {
      this.queue = [];
      return;
    }
    this.queue = this.queue.filter(game => game !== next);
    void this.load(next);
  }

  private async load(game: GameItem): Promise<void> {
    const key = prefetchKey(game);
    const job = { key, game, cancelled: false, controller: new AbortController() };
    this.inflight = job;
    const timeout = setTimeout(() => job.controller.abort(), this.limits.timeoutMs);
    try {
      const url = buildGameEntryUrl(game);
      const response = await this.fetcher(url, this.limits.timeoutMs, job.controller.signal);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.contentLength !== null && response.contentLength > this.limits.maxBytes) {
        throw new Error('too large');
      }
      // Avoid materializing a large response on JS during gameplay or a swipe.
      if (job.cancelled) return;
      const html = await response.text();
      // Account conservatively for UTF-16 string storage, not just code units.
      const bytes = html.length * 2;
      if (job.cancelled || job.controller.signal.aborted || bytes === 0 || bytes > this.limits.maxBytes) return;
      this.entries.set(key, { html, baseUrl: url, bytes, usedAt: this.now() });
      this.enforceBudget(key);
      this.saveLaunch();
    } catch {
      if (!job.cancelled) this.failedUntil.set(key, this.now() + this.limits.failureBackoffMs);
    } finally {
      clearTimeout(timeout);
      if (this.inflight === job) this.inflight = null;
      this.pump();
    }
  }

  private enforceBudget(justAdded: string | null): void {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    while (total > this.limits.budgetBytes && this.entries.size > 1) {
      const victim = this.leastRecentlyUsed(justAdded, false) ?? this.leastRecentlyUsed(justAdded, true);
      if (!victim) break;
      total -= this.entries.get(victim)?.bytes ?? 0;
      this.entries.delete(victim);
    }
  }

  private leastRecentlyUsed(except: string | null, includeProtected: boolean): string | null {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (key === except || (!includeProtected && this.protectedKeys.has(key))) continue;
      if (entry.usedAt < oldestAt) {
        oldestAt = entry.usedAt;
        oldestKey = key;
      }
    }
    return oldestKey;
  }
}

export const gamePrefetcher = new GamePrefetcher(undefined, {}, Date.now, launchCacheStorage);
