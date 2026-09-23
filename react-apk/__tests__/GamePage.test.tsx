import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GamePage, statusLabel } from '../src/components/feed/GamePage';
import type { GameItem } from '../src/types/game';
import { tutorialPageLoadPolicy } from '../src/feed/tutorialFlow';
import { PAUSE_SCRIPT, buildResumeScript } from '../src/services/gameBridge';

const mockStopLoading = jest.fn();
const mockInjectJavaScript = jest.fn();
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  return {
    WebView: ReactModule.forwardRef((props: object, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({
        injectJavaScript: mockInjectJavaScript,
        stopLoading: mockStopLoading,
      }));
      return ReactModule.createElement('MockGameWebView', props);
    }),
  };
});
const mockLocalUrl: { value: string | null } = { value: null };
jest.mock('../src/services/gameBundles', () => ({
  localUrlFor: () => mockLocalUrl.value,
  useBundleStore: (selector: (state: { ready: Record<string, unknown> }) => unknown) =>
    selector({ ready: {} }),
  // The page subscribes to download progress on its own; nothing is in flight
  // in these tests, and the selector must still be callable.
  useDownloadStore: (selector: (state: { active: Record<string, unknown> }) => unknown) =>
    selector({ active: {} }),
}));
const mockLoadEvents: Array<Record<string, unknown>> = [];
jest.mock('../src/services/analytics', () => ({
  analytics: {
    onGameLoad: (gameId: string, detail: Record<string, unknown>) =>
      mockLoadEvents.push({ gameId, ...detail }),
  },
}));
jest.mock('../src/components/StateViews', () => ({ MessageView: () => null }));
jest.mock('../src/store/playerStore', () => {
  const state = {
    coins: 0,
    soundMuted: true,
    vibrationEnabled: true,
    getSavedLevel: () => 1,
    getHighScore: () => 0,
  };
  const store: any = (selector: any) => (typeof selector === 'function' ? selector(state) : state);
  store.getState = () => state;
  return { usePlayerStore: store };
});

const game: GameItem = {
  id: 'test',
  title: 'Test',
  version: '1',
  entryUrl: 'https://games.example/test/index.html',
  thumbnailUrl: '',
  sizeBytes: 1000,
  orientation: 'portrait',
  engine: 'canvas',
  manifestUrl: '',
  feedOrder: 0,
  category: 'Arcade',
  description: '',
};
const props = {
  game,
  mayLoad: true,
  near: true,
  suspended: false,
  onPhase: jest.fn(),
  onMessage: jest.fn(),
};
let tree: TestRenderer.ReactTestRenderer;
const webviews = () =>
  tree.root.findAll(node => String(node.type) === 'MockGameWebView');

beforeEach(() => {
  jest.useFakeTimers();
  mockStopLoading.mockClear();
  mockInjectJavaScript.mockClear();
  mockLocalUrl.value = null;
  mockLoadEvents.length = 0;
});
afterEach(async () => {
  if (tree) {
    await act(async () => tree.unmount());
    tree = null as any;
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('a cold neighbor never starts an engine even when the caller opens its load gate', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="ahead" />);
  });
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(webviews()).toHaveLength(0);
});

test('only an explicitly opted-in bundled tutorial preloads and survives the swipe', async () => {
  const localGame = { ...game, tutorial: true, entryUrl: 'http://127.0.0.1/tutorial/index.html' };
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={localGame} slot="ahead" preloadTutorial />);
  });
  expect(webviews()).toHaveLength(1);
  await act(async () => { webviews()[0].props.onLoadStart(); });
  await act(async () => {
    tree.update(<GamePage {...props} game={localGame} slot="ahead" mayLoad={false} suspended />);
  });
  expect(webviews()).toHaveLength(1);
  expect(mockStopLoading).not.toHaveBeenCalled();
  await act(async () => { webviews()[0].props.onLoad(); });
  await act(async () => {
    tree.update(<GamePage {...props} game={localGame} slot="active" />);
  });
  expect(webviews()).toHaveLength(1);
});

test('the tutorial preload opt-in never starts a normal feed neighbor', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="ahead" preloadTutorial />);
  });
  expect(webviews()).toHaveLength(0);
});

test.each(['knife-hit', 'water-sort-3d', 'water-sort'])('%s boots only on selection and is not frozen by the settling flag', async id => {
  const selectedGame = { ...game, id, tutorial: true,
    entryUrl: `http://127.0.0.1/tutorial/${id}/index.html` };
  const page = (slot: 'ahead' | 'active', settling: boolean, hostSuspended = false) => (
    <GamePage {...props} game={selectedGame} slot={slot}
      {...tutorialPageLoadPolicy(selectedGame, slot, hostSuspended, settling, true)} />
  );
  await act(async () => { tree = TestRenderer.create(page('ahead', false)); });
  expect(webviews()).toHaveLength(0);
  // Even a caller accidentally opting into preloading must not park this game.
  await act(async () => {
    tree.update(<GamePage {...props} game={selectedGame} slot="ahead" preloadTutorial />);
  });
  expect(webviews()).toHaveLength(0);
  await act(async () => { tree.update(page('active', true)); });
  expect(webviews()).toHaveLength(1);
  expect(webviews()[0].props.source.uri).toContain('http://127.0.0.1/');
  await act(async () => { webviews()[0].props.onLoad(); });
  expect(mockInjectJavaScript).toHaveBeenCalledWith(buildResumeScript(false));
  expect(mockInjectJavaScript).not.toHaveBeenCalledWith(PAUSE_SCRIPT);
  // No dependence on the animation callback: loading finished while settling.
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(mockInjectJavaScript).not.toHaveBeenCalledWith(PAUSE_SCRIPT);
  await act(async () => { tree.update(page('active', false)); });
  expect(webviews()).toHaveLength(1);
  await act(async () => { tree.update(page('active', false, true)); });
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(PAUSE_SCRIPT);
  await act(async () => { tree.update(page('active', false)); });
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(buildResumeScript(false));
});

test('tutorial Water Sort stays cold during the page transition and loads after settling', async () => {
  const water = { ...game, id: 'water-sort-3d', title: 'Water Sort 3D' };
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={water} slot="ahead" mayLoad={false} />);
  });
  await act(async () => {
    tree.update(<GamePage {...props} game={water} slot="active" mayLoad={false} suspended={true} />);
  });
  expect(webviews()).toHaveLength(0);
  await act(async () => {
    tree.update(<GamePage {...props} game={water} slot="active" mayLoad={true} suspended={false} />);
  });
  expect(webviews()).toHaveLength(1);
  await act(async () => webviews()[0].props.onLoad());
  expect(props.onPhase).toHaveBeenCalledWith('water-sort-3d', 'ready');
});

test('swiping away during load stops and releases the abandoned WebView', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  expect(webviews()).toHaveLength(1);
  await act(async () => {
    tree.update(<GamePage {...props} slot="behind" mayLoad={false} />);
  });
  expect(mockStopLoading).toHaveBeenCalledTimes(1);
  expect(webviews()).toHaveLength(0);
});

test('a build stored on the device is loaded from the local origin, not the network', async () => {
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-1/index.html';
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  expect(webviews()[0].props.source).toEqual({
    uri: 'http://127.0.0.1:42731/tok/test/build-1/index.html',
  });
});

test('a game with no local build loads from the network, never from a JS-held document', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  const source = webviews()[0].props.source;
  // The only shapes a source may take now are two URLs. A document handed over
  // as an HTML string is exactly the path that kept games in the JS heap.
  expect(Object.keys(source)).toEqual(['uri']);
  expect(source.uri).toContain('https://games.example/test/index.html');
});

test('a bundle that lands mid-run does not swap the source under a running game', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  const original = webviews()[0].props.source;
  expect(original).toEqual({ uri: expect.stringContaining('https://games.example/test/index.html') });

  // The download finishes while the player is mid-game.
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-1/index.html';
  await act(async () => {
    tree.update(<GamePage {...props} slot="active" />);
  });
  expect(webviews()[0].props.source).toBe(original);
});

test('a page the player actually visited keeps its WebView when moved behind', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  await act(async () => {
    webviews()[0].props.onLoad();
  });
  await act(async () => {
    tree.update(<GamePage {...props} slot="behind" mayLoad={false} />);
  });
  expect(webviews()).toHaveLength(1);
  expect(mockStopLoading).not.toHaveBeenCalled();
});

test('a finished load reports its stages once, tagged with where it came from', async () => {
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-1/index.html';
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  await act(async () => {
    webviews()[0].props.onLoadStart();
    webviews()[0].props.onLoad();
  });
  expect(mockLoadEvents).toHaveLength(1);
  expect(mockLoadEvents[0]).toMatchObject({ gameId: 'test', outcome: 'ready', source: 'local' });

  // The in-page probe lands after onLoad; it must enrich that one event, not
  // add a second row for the same load.
  await act(async () => {
    webviews()[0].props.onMessage({
      nativeEvent: { data: JSON.stringify({ action: 'perf', payload: { dom: 120, load: 800, frame: 850 } }) },
    });
  });
  expect(mockLoadEvents).toHaveLength(1);
});

test('a load that times out is reported as a timeout, not silently dropped', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  await act(async () => {
    jest.advanceTimersByTime(65_000);
  });
  expect(mockLoadEvents).toHaveLength(1);
  expect(mockLoadEvents[0]).toMatchObject({ outcome: 'timeout', source: 'network' });
});

test('a completed game stays mounted when swiped away and back', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  const source = webviews()[0].props.source;
  await act(async () => {
    webviews()[0].props.onLoad();
  });
  await act(async () => {
    tree.update(<GamePage {...props} slot="behind" mayLoad={false} />);
  });
  expect(webviews()).toHaveLength(1);
  expect(mockStopLoading).not.toHaveBeenCalled();
  await act(async () => {
    tree.update(<GamePage {...props} slot="active" />);
  });
  expect(webviews()[0].props.source).toBe(source);
});

describe('statusLabel', () => {
  const base = { cached: false, live: true, phase: 'loading' as const, buildId: 'build-1' };

  test('a game already on the device is never told it is downloading', () => {
    expect(statusLabel({ ...base, cached: true })).toBe('Starting…');
    // Even with a download record for an older build hanging around.
    expect(
      statusLabel({
        ...base,
        cached: true,
        download: { gameId: 'test', buildId: 'build-0', bytesDone: 1, bytesTotal: 2, fraction: 0.5 },
      }),
    ).toBe('Starting…');
  });

  test('a download in flight shows Loading, not raw download percentage', () => {
    expect(
      statusLabel({
        ...base,
        download: { gameId: 'test', buildId: 'build-1', bytesDone: 470, bytesTotal: 1000, fraction: 0.47 },
      }),
    ).toBe('Loading…');
  });

  test('a download in flight or retrying presents as Loading', () => {
    expect(
      statusLabel({
        ...base,
        download: {
          gameId: 'test',
          buildId: 'build-1',
          bytesDone: 0,
          bytesTotal: 0,
          fraction: null,
          failed: { reason: 'HTTP 503', retryInMs: 30000 },
        },
      }),
    ).toBe('Loading…');
  });

  test('nothing is said once the game is up or has given up', () => {
    expect(statusLabel({ ...base, phase: 'ready' })).toBeNull();
    expect(statusLabel({ ...base, phase: 'error' })).toBeNull();
  });
});
