import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GamePage, statusLabel, type GamePageHandle } from '../src/components/feed/GamePage';
import type { GameItem } from '../src/types/game';
import { tutorialPageLoadPolicy } from '../src/feed/tutorialFlow';
import { PAUSE_SCRIPT, buildResumeScript } from '../src/services/gameBridge';

const mockOffline = { value: false };
jest.mock('../src/hooks/useNetworkStatus', () => ({
  useIsOffline: () => mockOffline.value,
}));
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
const mockReady: { value: Record<string, unknown> } = { value: {} };
const mockPrepareLive = jest.fn((item: GameItem) => Promise.resolve(
  `http://127.0.0.1:42731/tok/${item.id}/${item.buildId}/index.html`,
));
jest.mock('../src/services/gameBundles', () => ({
  localUrlFor: () => mockLocalUrl.value,
  prepareLiveBundle: (item: GameItem) => mockPrepareLive(item),
  useBundleStore: (selector: (state: { ready: Record<string, unknown> }) => unknown) =>
    selector({ ready: mockReady.value }),
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
jest.mock('../src/components/StateViews', () => ({
  MessageView: (viewProps: object) => require('react').createElement('MockMessageView', viewProps),
}));
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
const messages = () =>
  tree.root.findAll(node => String(node.type) === 'MockMessageView');

beforeEach(() => {
  jest.useFakeTimers();
  mockStopLoading.mockClear();
  mockInjectJavaScript.mockClear();
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-1/index.html';
  mockReady.value = {};
  mockPrepareLive.mockReset();
  mockPrepareLive.mockImplementation((item: GameItem) => Promise.resolve(
    `http://127.0.0.1:42731/tok/${item.id}/${item.buildId}/index.html`,
  ));
  mockOffline.value = false;
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

test('ad pause/resume keeps the same WebView and does not replay saved progress or restart', async () => {
  const ref = React.createRef<GamePageHandle>();
  await act(async () => { tree = TestRenderer.create(<GamePage {...props} slot="active" ref={ref} />); });
  await act(async () => { webviews()[0].props.onLoad(); });
  const view = webviews()[0];
  const source = view.props.source;
  mockInjectJavaScript.mockClear();
  act(() => ref.current!.pause(true));
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(PAUSE_SCRIPT);
  await act(async () => { tree.update(<GamePage {...props} slot="active" suspended ref={ref} />); });
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(webviews()[0]).toBe(view);
  await act(async () => { tree.update(<GamePage {...props} slot="active" ref={ref} />); });
  expect(mockInjectJavaScript).toHaveBeenLastCalledWith(buildResumeScript(false, true));
  expect(mockInjectJavaScript.mock.calls.filter(([script]) => script !== PAUSE_SCRIPT)).toEqual([
    [buildResumeScript(false, true)],
  ]);
  expect(webviews()[0]).toBe(view);
  expect(webviews()[0].props.source).toBe(source);
  expect(mockStopLoading).not.toHaveBeenCalled();
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

test('a game with no local build waits for the disk downloader', async () => {
  mockLocalUrl.value = null;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  expect(webviews()).toHaveLength(0);
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-1/index.html';
  await act(async () => tree.update(<GamePage {...props} slot="active" near={false} />));
  expect(webviews()[0].props.source.uri).toBe(mockLocalUrl.value);
});

const serverGame: GameItem = {
  ...game,
  id: 'game-abc',
  version: '1.0.0',
  entryUrl: 'https://games.raiabdullah.tech/games/game-abc/1.0.0/index.html',
  bundleUrl: 'https://games.raiabdullah.tech/api/offline-bundles/game-abc/1.0.0/bundle.json',
  buildId: 'build-123',
};

test('a missing server game fast-starts through the local proxy while online', async () => {
  mockLocalUrl.value = null;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  expect(webviews()[0].props.source.uri).toBe(
    'http://127.0.0.1:42731/tok/game-abc/build-123/index.html',
  );
  expect(mockPrepareLive).toHaveBeenCalledWith(serverGame);
  await act(async () => {
    webviews()[0].props.onLoadStart();
    webviews()[0].props.onLoad();
  });
  expect(mockLoadEvents[0]).toMatchObject({ source: 'network', outcome: 'ready' });
  const source = webviews()[0].props.source;
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/game-abc/build-123/index.html';
  await act(async () => tree.update(<GamePage {...props} game={serverGame} slot="active" />));
  expect(webviews()[0].props.source).toBe(source);
});

test('a missing server game does not try the network offline', async () => {
  mockLocalUrl.value = null;
  mockOffline.value = true;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  expect(webviews()).toHaveLength(0);
});

test('a failed fast-start retries once, then offers Retry and recovers when the local bundle arrives', async () => {
  mockLocalUrl.value = null;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  const url = webviews()[0].props.source.uri;
  await act(async () => {
    webviews()[0].props.onHttpError({ nativeEvent: { url, statusCode: 404 } });
  });
  expect(webviews()).toHaveLength(1);
  await act(async () => {
    webviews()[0].props.onHttpError({ nativeEvent: { url, statusCode: 404 } });
  });
  expect(messages()[0].props.actionLabel).toBe('Retry');
  expect(messages()[0].props.body).toContain('HTTP 404');
  expect(props.onPhase).toHaveBeenLastCalledWith(serverGame.id, 'error');
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/game-abc/build-123/index.html';
  mockReady.value = { [serverGame.id]: { buildId: serverGame.buildId } };
  await act(async () => tree.update(<GamePage {...props} game={serverGame} slot="active" near={false} />));
  expect(webviews()[0].props.source.uri).toBe(mockLocalUrl.value);
  expect(messages()).toHaveLength(0);
});

test('a network error keeps Retry visible and a manual retry starts a fresh attempt', async () => {
  mockLocalUrl.value = null;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  const error = { nativeEvent: { description: 'Connection interrupted' } };
  await act(async () => { webviews()[0].props.onError(error); });
  await act(async () => { webviews()[0].props.onError(error); });
  expect(messages()[0].props.body).toBe('Connection interrupted');
  expect(mockLoadEvents.filter(event => event.outcome === 'error')).toHaveLength(2);
  await act(async () => { messages()[0].props.onAction(); });
  expect(messages()).toHaveLength(0);
  await act(async () => { webviews()[0].props.onLoad(); });
  expect(props.onPhase).toHaveBeenLastCalledWith(serverGame.id, 'ready');
});

test('failure to prepare fast-start offers Retry instead of an endless placeholder', async () => {
  mockLocalUrl.value = null;
  mockPrepareLive.mockResolvedValueOnce(null as any).mockResolvedValueOnce(null as any);
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  expect(mockPrepareLive).toHaveBeenCalledTimes(2);
  expect(webviews()).toHaveLength(0);
  expect(messages()[0].props.actionLabel).toBe('Retry');
  await act(async () => { messages()[0].props.onAction(); });
  expect(webviews()).toHaveLength(1);
  expect(messages()).toHaveLength(0);
});

test('a failed remote page tries again when connectivity returns', async () => {
  mockLocalUrl.value = null;
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} game={serverGame} slot="active" />);
  });
  const error = { nativeEvent: { description: 'Connection interrupted' } };
  await act(async () => { webviews()[0].props.onError(error); });
  await act(async () => { webviews()[0].props.onError(error); });
  mockOffline.value = true;
  await act(async () => tree.update(<GamePage {...props} game={serverGame} slot="active" near={false} />));
  expect(messages()).toHaveLength(1);
  mockOffline.value = false;
  await act(async () => tree.update(<GamePage {...props} game={serverGame} slot="active" />));
  expect(messages()).toHaveLength(0);
  expect(props.onPhase).toHaveBeenLastCalledWith(serverGame.id, 'loading');
});

test('a bundle that lands mid-run does not swap the source under a running game', async () => {
  await act(async () => {
    tree = TestRenderer.create(<GamePage {...props} slot="active" />);
  });
  const original = webviews()[0].props.source;
  expect(original).toEqual({ uri: expect.stringContaining('http://127.0.0.1:42731/') });

  // The download finishes while the player is mid-game.
  mockLocalUrl.value = 'http://127.0.0.1:42731/tok/test/build-2/index.html';
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
  expect(mockLoadEvents[0]).toMatchObject({ outcome: 'timeout', source: 'local' });
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
