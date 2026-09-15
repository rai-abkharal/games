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
}

interface BundleRequest {
  gameId: string;
  version: string;
  buildId: string;
  bundleUrl: string;
  /** The game on screen — exempt from every speculative rate ceiling. */
  foreground: boolean;
}

interface BundlePolicy {
  /** Ceiling for speculative bundles while a game is running. 0 = no limit. */
  playingRateBytesPerSecond?: number;
  /** Ceiling for speculative bundles on a metered link. 0 = no limit. */
  meteredRateBytesPerSecond?: number;
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

/** Synchronous read for render paths; never suspends and never hits the bridge. */
export function localUrlFor(game: Pick<GameItem, 'id' | 'buildId'>): string | null {
  if (!game.buildId) return null;
  const entry = useBundleStore.getState().ready[game.id];
  // The build must match exactly: a stored copy of an older build is stale the
  // moment the catalogue advertises a new one.
  return entry && entry.buildId === game.buildId ? entry.url : null;
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
        emitter.addListener('GameBundleReady', (bundle: unknown) =>
          mergeReady([bundle as ReadyBundle]),
        ),
        emitter.addListener('GameBundleFailed', () => {
          // Nothing to do: the game keeps loading from the network, and the
          // build stays in the wish-list for the next sync to retry.
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
 * Builds already stored are filtered out natively, so a relaunch with an
 * unchanged catalogue issues no requests at all.
 */
export function syncBundles(games: GameItem[], foregroundGameId: string | null = null): void {
  if (!native) return;
  const requests: BundleRequest[] = games
    .filter(game => game.buildId && game.bundleUrl)
    .map(game => ({
      gameId: game.id,
      version: game.version,
      buildId: String(game.buildId),
      bundleUrl: String(game.bundleUrl),
      foreground: game.id === foregroundGameId,
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
