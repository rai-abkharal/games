import { fetchWithTimeout } from '../api/http';
import { FEED } from '../config/env';
import type { GameItem } from '../types/game';
import { buildGameEntryUrl } from '../utils/url';

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
 * Budgeted (entry count + bytes), one download at a time, nearest game first,
 * and silent on failure — a prefetch that fails just means the WebView loads
 * the URL itself, exactly as it would without this service.
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

export type PrefetchFetcher = (url: string, timeoutMs: number) => Promise<PrefetchResponse>;

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

const defaultFetcher: PrefetchFetcher = async (url, timeoutMs) => {
  const response = await fetchWithTimeout(url, {
    timeoutMs,
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
export function prefetchKey(game: Pick<GameItem, 'id' | 'version' | 'updatedAt' | 'sha256'>): string {
  return `${game.id}|${game.version}|${game.updatedAt ?? game.sha256 ?? ''}`;
}

export class GamePrefetcher {
  private readonly entries = new Map<string, Entry>();
  private readonly failedUntil = new Map<string, number>();
  private queue: GameItem[] = [];
  private inflight: { key: string; cancelled: boolean } | null = null;
  private online = true;
  private readonly limits: PrefetchLimits;

  constructor(
    private readonly fetcher: PrefetchFetcher = defaultFetcher,
    limits: Partial<PrefetchLimits> = {},
    private readonly now: () => number = Date.now,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) this.pump();
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
    if (this.inflight && !wanted.has(this.inflight.key)) this.inflight.cancelled = true;
    this.pump();
  }

  /** Drops every entry that is not for one of `games`. */
  retain(games: GameItem[]): void {
    const keep = new Set(games.map(prefetchKey));
    for (const key of Array.from(this.entries.keys())) {
      if (!keep.has(key)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.queue = [];
    if (this.inflight) this.inflight.cancelled = true;
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

  private pump(): void {
    if (this.inflight || !this.online) return;
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
    const job = { key, cancelled: false };
    this.inflight = job;
    try {
      const url = buildGameEntryUrl(game);
      const response = await this.fetcher(url, this.limits.timeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.contentLength !== null && response.contentLength > this.limits.maxBytes) {
        throw new Error('too large');
      }
      const html = await response.text();
      const bytes = html.length;
      if (job.cancelled || bytes === 0 || bytes > this.limits.maxBytes) return;
      this.entries.set(key, { html, baseUrl: url, bytes, usedAt: this.now() });
      this.enforceBudget(key);
    } catch {
      this.failedUntil.set(key, this.now() + this.limits.failureBackoffMs);
    } finally {
      if (this.inflight === job) this.inflight = null;
      this.pump();
    }
  }

  private enforceBudget(justAdded: string): void {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    while (total > this.limits.budgetBytes && this.entries.size > 1) {
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (key === justAdded) continue;
        if (entry.usedAt < oldestAt) {
          oldestAt = entry.usedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      total -= this.entries.get(oldestKey)?.bytes ?? 0;
      this.entries.delete(oldestKey);
    }
  }
}

export const gamePrefetcher = new GamePrefetcher();
