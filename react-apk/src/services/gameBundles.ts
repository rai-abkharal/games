import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';
import { create } from 'zustand';
import type { GameItem } from '../types/game';

/**
 * JavaScript's half of the on-device game store.
 *
 * It deliberately knows almost nothing. The native module owns the files, the
 * downloads and the loopback origin; this module owns a wish-list and a map of
 * "which builds are playable right now", which is all the feed needs in order
 * to decide what a page's WebView should load.
 *
 * Nothing here ever touches game bytes. The only things that cross the bridge
 * are catalogue-sized descriptors going down and small status events coming
 * back, so a 30 MB game costs JavaScript the same as an 8 KB one.
 *
 * Every entry point is a no-op when the native module is missing (iOS, Jest,
 * an older build of the app), and the feed falls back to loading games from
 * the network exactly as it did before.
 */

export interface ReadyBundle {
  gameId: string;
  buildId: string;
  entry: string;
  /** `http://127.0.0.1:<port>/<token>/<gameId>/<buildId>/<entry>` */
  url: string;
  /** Size of the build, present on the event that announces a finished download. */
  bytes?: number;
  /** Wall-clock milliseconds the download took, timed natively. */
  elapsedMs?: number;
}

/**
 * How close a game is to the player. The native queue runs strictly in this
 * order and applies rate ceilings by it, so it is the single knob that decides
 * what gets bandwidth when.
 */
export const BundlePriority = {
  /** The page on screen. Never rate-limited, always first. */
  current: 0,
  /** One swipe away — the game whose absence the player is about to see. */
  next: 1,
  /** The short lookahead behind that (+2, +3). */
  near: 2,
  /** The rest of the catalogue, filled in when nothing better is waiting. */
  rest: 3,
} as const;

export type BundlePriorityValue = (typeof BundlePriority)[keyof typeof BundlePriority];

interface BundleRequest {
  gameId: string;
  version: string;
  buildId: string;
  bundleUrl: string;
  priority: BundlePriorityValue;
}

interface BundlePolicy {
  /** Ceiling for the *distant* catalogue while a game is running. 0 = no limit. */
  playingRateBytesPerSecond?: number;
  /** Ceiling for the distant catalogue on a metered link. 0 = no limit. */
  meteredRateBytesPerSecond?: number;
  /** Ceiling for the next game while one is being played, unmetered. */
  nextRateBytesPerSecond?: number;
  /** Ceiling for the next game on a metered link. */
  meteredNextRateBytesPerSecond?: number;
  storageBudgetBytes?: number;
  /** Cellular or otherwise expensive connection. */
  metered?: boolean;
}

interface NativeGameBundles {
  start(): Promise<{ available: boolean; port: number; ready: ReadyBundle[] }>;
  sync(requests: BundleRequest[]): void;
  setPlaying(playing: boolean): void;
  setPaused(paused: boolean): void;
  setPolicy(policy: BundlePolicy): void;
  markPlayed(gameId: string): void;
  warm(gameId: string): void;
  getStatus(): Promise<{ available: boolean; port: number; usedBytes: number; ready: ReadyBundle[] }>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// Presence is the only test that matters: the module is registered by the
// Android app, so on iOS — and in Jest, and in any build made before the store
// existed — this is simply absent and every entry point below no-ops.
const native: NativeGameBundles | null = ((NativeModules as any)?.GameBundles ?? null);

export function isBundleStoreAvailable(): boolean {
  return native !== null;
}

interface BundleState {
  /** gameId -> the build currently playable from disk. */
  ready: Record<string, ReadyBundle>;
  started: boolean;
}

export const useBundleStore = create<BundleState>(() => ({ ready: {}, started: false }));

/**
 * Live download state, kept in a store of its own on purpose.
 *
 * Progress arrives four times a second. Putting it in `useBundleStore` would
 * re-render every component that only wanted to know whether a build is
 * playable — including the feed and its pager — four times a second, during a
 * download, which is exactly when frames matter most. Only the placeholder of
 * the page being downloaded subscribes here, and it subscribes to one game's
 * slice rather than the map.
 */
export interface BundleDownload {
  gameId: string;
  buildId: string;
  bytesDone: number;
  bytesTotal: number;
  /** 0..1, or null when the size is not known yet. */
  fraction: number | null;
  failed?: { reason: string; retryInMs: number };
}

interface DownloadState {
  active: Record<string, BundleDownload>;
}

export const useDownloadStore = create<DownloadState>(() => ({ active: {} }));

/** Synchronous read for render paths; never suspends and never hits the bridge. */
export function localUrlFor(game: Pick<GameItem, 'id' | 'buildId'>): string | null {
  if (!game.buildId) return null;
  const entry = useBundleStore.getState().ready[game.id];
  // The build must match exactly: a stored copy of an older build is stale the
  // moment the catalogue advertises a new one.
  return entry && entry.buildId === game.buildId ? entry.url : null;
}

/** The download in flight for a game, if any. Safe to call from a selector. */
export function downloadFor(gameId: string): BundleDownload | undefined {
  return useDownloadStore.getState().active[gameId];
}

function mergeReady(bundles: ReadyBundle[]): void {
  if (!bundles.length) return;
  useBundleStore.setState(state => {
    const ready = { ...state.ready };
    for (const bundle of bundles) {
      if (bundle?.gameId && bundle.buildId && bundle.url) ready[bundle.gameId] = bundle;
    }
    return { ready };
  });
}

function setDownload(gameId: string, next: BundleDownload | null): void {
  useDownloadStore.setState(state => {
    const current = state.active[gameId];
    if (!next) {
      if (!current) return state;
      const active = { ...state.active };
      delete active[gameId];
      return { active };
    }
    // Progress ticks land at 4 Hz; skipping the ones that would not move a
    // percentage on screen keeps React out of the loop entirely.
    if (
      current &&
      current.buildId === next.buildId &&
      current.failed === next.failed &&
      Math.round((current.fraction ?? -1) * 100) === Math.round((next.fraction ?? -1) * 100)
    ) {
      return state;
    }
    return { active: { ...state.active, [gameId]: next } };
  });
}

/** Callbacks the feed registers so finished and failed downloads reach analytics. */
interface BundleObserver {
  onReady?: (bundle: ReadyBundle) => void;
  onFailed?: (event: { gameId: string; buildId: string; reason: string; retryInMs: number }) => void;
}

let observer: BundleObserver = {};

export function setBundleObserver(next: BundleObserver): void {
  observer = next;
}

let subscriptions: EmitterSubscription[] = [];
let starting: Promise<void> | null = null;

/**
 * Brings up the loopback origin and publishes whatever is already on disk.
 * Safe to call repeatedly; the work happens once.
 */
export function startBundleStore(): Promise<void> {
  if (!native) return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    try {
      const emitter = new NativeEventEmitter(native as any);
      subscriptions = [
        emitter.addListener('GameBundleReady', (raw: unknown) => {
          const bundle = raw as ReadyBundle;
          mergeReady([bundle]);
          setDownload(bundle.gameId, null);
          observer.onReady?.(bundle);
        }),
        emitter.addListener('GameBundleStarted', (raw: unknown) => {
          const event = raw as { gameId: string; buildId: string; bytesDone: number; bytesTotal: number };
          if (!event?.gameId) return;
          setDownload(event.gameId, {
            gameId: event.gameId,
            buildId: event.buildId,
            bytesDone: event.bytesDone ?? 0,
            bytesTotal: event.bytesTotal ?? 0,
            fraction: event.bytesTotal > 0 ? (event.bytesDone ?? 0) / event.bytesTotal : null,
          });
        }),
        emitter.addListener('GameBundleProgress', (raw: unknown) => {
          const event = raw as { gameId: string; buildId: string; bytesDone: number; bytesTotal: number };
          if (!event?.gameId) return;
          setDownload(event.gameId, {
            gameId: event.gameId,
            buildId: event.buildId,
            bytesDone: event.bytesDone ?? 0,
            bytesTotal: event.bytesTotal ?? 0,
            fraction: event.bytesTotal > 0 ? (event.bytesDone ?? 0) / event.bytesTotal : null,
          });
        }),
        emitter.addListener('GameBundleFailed', (raw: unknown) => {
          const event = raw as { gameId: string; buildId: string; reason: string; retryInMs: number };
          if (!event?.gameId) return;
          // The page keeps loading from the network, and the build stays in the
          // wish-list for the next sync to retry after the native back-off. The
          // record is kept so the placeholder can say *why* it is waiting.
          setDownload(event.gameId, {
            gameId: event.gameId,
            buildId: event.buildId,
            bytesDone: 0,
            bytesTotal: 0,
            fraction: null,
            failed: { reason: event.reason, retryInMs: event.retryInMs ?? 0 },
          });
          observer.onFailed?.(event);
        }),
      ];
    } catch {
      /* an emitter we cannot build only costs live updates, not correctness */
    }
    try {
      const result = await native.start();
      mergeReady(result?.ready ?? []);
      useBundleStore.setState({ started: Boolean(result?.available) });
    } catch {
      useBundleStore.setState({ started: false });
    }
  })();
  return starting;
}

export function stopBundleStore(): void {
  for (const subscription of subscriptions) subscription.remove();
  subscriptions = [];
}

/**
 * Hands the native queue the games worth having on disk, most wanted first.
 *
 * `priorityFor` says how close each game is to the player. The native side
 * runs the queue strictly in that order and re-scores the job already in
 * flight against it, so a distant bundle that started before the last swipe is
 * paused rather than allowed to hold up the game about to be opened. Builds
 * already stored are filtered out natively, so a relaunch with an unchanged
 * catalogue issues no requests at all.
 */
export function syncBundles(
  games: GameItem[],
  priorityFor: (game: GameItem, index: number) => BundlePriorityValue = () => BundlePriority.rest,
): void {
  if (!native) return;
  const requests: BundleRequest[] = games
    .filter(game => game.buildId && game.bundleUrl)
    .map((game, index) => ({
      gameId: game.id,
      version: game.version,
      buildId: String(game.buildId),
      bundleUrl: String(game.bundleUrl),
      priority: priorityFor(game, index),
    }));
  if (!requests.length) return;
  try {
    native.sync(requests);
  } catch {
    /* the feed still plays from the network */
  }
}

export function setBundlePolicy(policy: BundlePolicy): void {
  try {
    native?.setPolicy(policy);
  } catch {
    /* ignore */
  }
}

export function setBundlePlaying(playing: boolean): void {
  try {
    native?.setPlaying(playing);
  } catch {
    /* ignore */
  }
}

export function setBundlePaused(paused: boolean): void {
  try {
    native?.setPaused(paused);
  } catch {
    /* ignore */
  }
}

export function markBundlePlayed(gameId: string): void {
  try {
    native?.markPlayed(gameId);
  } catch {
    /* ignore */
  }
}

/**
 * Asks the store to pull a stored build through the kernel page cache, so the
 * WebView's first read of it comes from memory rather than flash. Cheap, and
 * only worth doing for the game the player is one swipe from.
 */
export function warmBundle(gameId: string): void {
  try {
    native?.warm(gameId);
  } catch {
    /* ignore */
  }
}

export async function bundleStatus(): Promise<{
  available: boolean;
  port: number;
  usedBytes: number;
  ready: ReadyBundle[];
} | null> {
  if (!native) return null;
  try {
    return await native.getStatus();
  } catch {
    return null;
  }
}
