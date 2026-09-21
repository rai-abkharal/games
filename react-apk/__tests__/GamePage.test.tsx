import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GamePage, statusLabel } from '../src/components/feed/GamePage';
import type { GameItem } from '../src/types/game';

const mockStopLoading = jest.fn();
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  return {
    WebView: ReactModule.forwardRef((props: object, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({
        injectJavaScript: jest.fn(),
        stopLoading: mockStopLoading,
      }));
      return ReactModule.createElement('MockGameWebView', props);
    }),
  };
});
const mockLocalUrl: { value: string | null } = { value: null };
jest.mock('../src/services/gameBundles', () => ({
  localUrlFor: () => mockLocalUrl.value,
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
jest.mock('../src/store/playerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      coins: 0,
      soundMuted: true,
      getSavedLevel: () => 1,
      getHighScore: () => 0,
    }),
  },
}));

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
    jest.advanceTimersByTime(30_000);
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

  test('a download in flight shows its real percentage, not a spinner', () => {
    expect(
      statusLabel({
        ...base,
        download: { gameId: 'test', buildId: 'build-1', bytesDone: 470, bytesTotal: 1000, fraction: 0.47 },
      }),
    ).toBe('Downloading 47%');
  });

  test('a failed download reads as a retry, not as a dead end', () => {
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
    ).toBe('Connection problem — retrying…');
  });

  test('nothing is said once the game is up or has given up', () => {
    expect(statusLabel({ ...base, phase: 'ready' })).toBeNull();
    expect(statusLabel({ ...base, phase: 'error' })).toBeNull();
  });
});
