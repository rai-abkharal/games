import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GamePage } from '../src/components/feed/GamePage';
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
jest.mock('../src/services/gamePrefetcher', () => ({
  gamePrefetcher: { get: () => null },
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
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
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
