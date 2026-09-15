import { NativeModules } from 'react-native';
import type { GameItem } from '../src/types/game';

const sync = jest.fn();
const setPlaying = jest.fn();
const markPlayed = jest.fn();

// Only the event emitter is stubbed: the real one wants a live native module
// behind it. Everything else uses the RN jest preset as-is, and the module
// under test finds its native side through NativeModules, which the suite
// populates below.
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter', () => {
  return class {
    addListener() {
      return { remove: () => {} };
    }
  };
});

function game(id: string, overrides: Partial<GameItem> = {}): GameItem {
  return {
    id,
    title: id,
    version: '1.0.0',
    entryUrl: `http://host/games/${id}/1.0.0/index.html`,
    thumbnailUrl: '',
    sizeBytes: 1000,
    orientation: 'portrait',
    engine: 'canvas',
    manifestUrl: '',
    feedOrder: 0,
    category: 'Arcade',
    description: '',
    buildId: 'build-1',
    bundleUrl: `http://host/games/${id}/1.0.0/bundle.json`,
    ...overrides,
  };
}

let bundles: typeof import('../src/services/gameBundles');

beforeEach(() => {
  jest.resetModules();
  sync.mockClear();
  setPlaying.mockClear();
  markPlayed.mockClear();
  Object.assign(NativeModules, {
    GameBundles: {
      start: jest.fn(async () => ({ available: true, port: 42731, ready: [] })),
      sync,
      setPlaying,
      setPaused: jest.fn(),
      setPolicy: jest.fn(),
      markPlayed,
      getStatus: jest.fn(async () => ({ available: true, port: 42731, usedBytes: 0, ready: [] })),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    },
  });
  bundles = require('../src/services/gameBundles');
});

describe('localUrlFor', () => {
  it('serves a stored build only when its id matches what the catalogue advertises', () => {
    bundles.useBundleStore.setState({
      ready: {
        alpha: {
          gameId: 'alpha',
          buildId: 'build-1',
          entry: 'index.html',
          url: 'http://127.0.0.1:42731/tok/alpha/build-1/index.html',
        },
      },
    });

    expect(bundles.localUrlFor(game('alpha'))).toBe(
      'http://127.0.0.1:42731/tok/alpha/build-1/index.html',
    );
    // A newer build on the server makes the stored copy stale: the page must
    // fall back to the network rather than silently play the old game.
    expect(bundles.localUrlFor(game('alpha', { buildId: 'build-2' }))).toBeNull();
    expect(bundles.localUrlFor(game('beta'))).toBeNull();
  });

  it('returns nothing for a game the catalogue has no build id for', () => {
    expect(bundles.localUrlFor(game('alpha', { buildId: undefined }))).toBeNull();
  });
});

describe('syncBundles', () => {
  it('sends only catalogue descriptors, in the order given, and never game content', () => {
    bundles.syncBundles([game('alpha'), game('beta'), game('gamma', { bundleUrl: undefined })]);

    expect(sync).toHaveBeenCalledTimes(1);
    const payload = sync.mock.calls[0][0];
    expect(payload.map((item: any) => item.gameId)).toEqual(['alpha', 'beta']);
    for (const item of payload) {
      expect(Object.keys(item).sort()).toEqual(['buildId', 'bundleUrl', 'gameId', 'version']);
    }
  });

  it('does not call across the bridge when no game has a bundle', () => {
    bundles.syncBundles([game('alpha', { bundleUrl: undefined, buildId: undefined })]);
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('start', () => {
  it('publishes builds already on disk so the first page can open locally', async () => {
    (NativeModules as any).GameBundles.start = jest.fn(async () => ({
      available: true,
      port: 42731,
      ready: [
        {
          gameId: 'alpha',
          buildId: 'build-1',
          entry: 'index.html',
          url: 'http://127.0.0.1:42731/tok/alpha/build-1/index.html',
        },
      ],
    }));

    await bundles.startBundleStore();

    expect(bundles.useBundleStore.getState().started).toBe(true);
    expect(bundles.localUrlFor(game('alpha'))).toBe(
      'http://127.0.0.1:42731/tok/alpha/build-1/index.html',
    );
  });

  it('degrades to network loading when the native store cannot start', async () => {
    (NativeModules as any).GameBundles.start = jest.fn(async () => {
      throw new Error('no store');
    });

    await expect(bundles.startBundleStore()).resolves.toBeUndefined();
    expect(bundles.useBundleStore.getState().started).toBe(false);
    expect(bundles.localUrlFor(game('alpha'))).toBeNull();
  });
});

describe('play signalling', () => {
  it('mirrors the feed play state and records selections for eviction order', () => {
    bundles.setBundlePlaying(true);
    bundles.markBundlePlayed('alpha');
    expect(setPlaying).toHaveBeenCalledWith(true);
    expect(markPlayed).toHaveBeenCalledWith('alpha');
  });
});
