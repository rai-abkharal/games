import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FeedScreen } from '../src/screens/FeedScreen';
import { BUNDLED_GAMES } from '../src/config/bundledGames';
import { useCatalogStore } from '../src/store/catalogStore';
import { usePlayerStore } from '../src/store/playerStore';
import { useTutorialStore } from '../src/store/tutorialStore';
import { prepareNextBundle } from '../src/services/gameBundles';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' }));
jest.mock('../src/hooks/useAppState', () => ({ useAppStateChange: () => {} }));
jest.mock('../src/hooks/useNetworkStatus', () => ({ useIsOffline: () => false, useIsMetered: () => false }));
jest.mock('../src/theme/useTheme', () => ({ useTheme: () => require('../src/theme/themes').THEMES.eibi_purple }));
jest.mock('../src/i18n/translations', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../src/services/analytics', () => ({ analytics: new Proxy({}, { get: () => jest.fn() }) }));
jest.mock('../src/services/adManager', () => ({
  adManager: new Proxy({}, { get: () => jest.fn() }),
  useAdsStore: Object.assign((selector: any) => selector({ bannerEnabled: false, fullScreenAdShowing: false }), {
    getState: () => ({ fullScreenAdShowing: false }),
  }),
}));
jest.mock('../src/services/gameBundles', () => ({
  useBundleStore: (selector: any) => selector({ tutorials: [], bootFinished: true }),
  isBundleStoreAvailable: () => false,
  localUrlFor: () => null,
  BundlePriority: { current: 0, next: 1, near: 2, rest: 3 },
  markBundlePlayed: jest.fn(), setBundleObserver: jest.fn(), setBundlePaused: jest.fn(),
  prepareNextBundle: jest.fn(),
  setBundlePlaying: jest.fn(), setBundlePolicy: jest.fn(), syncBundles: jest.fn(), warmBundle: jest.fn(),
}));
jest.mock('../src/components/feed/FeedHeader', () => ({ FeedHeader: 'FeedHeader' }));
jest.mock('../src/components/feed/FeedDock', () => ({ FeedDock: 'FeedDock' }));
jest.mock('../src/components/tutorial/PreGameTutorial', () => ({ PreGameTutorial: 'PreGameTutorial' }));
jest.mock('../src/components/tutorial/HomeSwipeTutorial', () => ({ HomeSwipeTutorial: 'HomeSwipeTutorial' }));
jest.mock('../src/components/feed/GamePager', () => ({
  GamePager: (props: any) => require('react').createElement('GamePager', props, props.renderPage(props.index)),
}));
jest.mock('../src/components/feed/GamePage', () => ({
  GamePage: require('react').forwardRef((props: any, _ref: any) => require('react').createElement('GamePage', props)),
}));

let tree: TestRenderer.ReactTestRenderer;
const node = (type: string) => tree.root.findByType(type as any);
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const game = (id: string) => ({ ...BUNDLED_GAMES[0], id, title: id });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useCatalogStore.setState({ games: [game('first'), game('second')], status: 'ready' });
  usePlayerStore.setState({ lastPlayedGameId: null, favorites: [] });
  useTutorialStore.setState({ hydrated: true, firstTimeTutorialCompleted: true, homeSwipeSeen: false });
  act(() => { tree = TestRenderer.create(<FeedScreen navigation={{ navigate: jest.fn() } as any} route={{} as any} />); });
  const stage = tree.root.findAll(node => typeof node.props.onLayout === 'function')[0];
  act(() => stage.props.onLayout({ nativeEvent: { layout: { width: 400, height: 800 } } }));
});

test('next startup preparation waits for readiness and a stable interval without booting another page', () => {
  advance(5_000);
  expect(prepareNextBundle).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }));
  act(() => node('GamePage').props.onPhase('first', 'ready'));
  advance(1_499);
  expect(prepareNextBundle).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }));
  advance(1);
  expect(prepareNextBundle).toHaveBeenCalledWith(expect.objectContaining({ id: 'second' }));
  expect(tree.root.findAllByType('GamePage' as any)).toHaveLength(1);
  act(() => node('GamePager').props.onSwipeStart());
  expect(prepareNextBundle).toHaveBeenLastCalledWith(null);
});
afterEach(() => {
  act(() => tree.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('home hint waits for game readiness and then a ten-second delay', () => {
  advance(30_000);
  expect(node('HomeSwipeTutorial').props.visible).toBe(false);
  act(() => node('GamePage').props.onPhase('first', 'ready'));
  advance(9_999);
  expect(node('HomeSwipeTutorial').props.visible).toBe(false);
  advance(1);
  expect(node('HomeSwipeTutorial').props.visible).toBe(true);
});

test('finishing pre-game tutorial does not immediately show a hint for an already-ready game', () => {
  act(() => useTutorialStore.setState({ firstTimeTutorialCompleted: false }));
  act(() => node('GamePage').props.onPhase('first', 'ready'));
  advance(20_000);
  act(() => node('PreGameTutorial').props.onComplete());
  expect(node('HomeSwipeTutorial').props.visible).toBe(false);
  advance(9_999);
  expect(node('HomeSwipeTutorial').props.visible).toBe(false);
  advance(1);
  expect(node('HomeSwipeTutorial').props.visible).toBe(true);
});

test('swipes and game completion never reveal a collapsed dock', () => {
  expect(node('FeedDock').props.visible).toBe(false);
  act(() => node('GamePager').props.onSwipeStart());
  act(() => node('GamePager').props.onIndexChange(1, 1));
  act(() => node('GamePager').props.onSettled(1));
  expect(node('FeedDock').props.visible).toBe(false);
  act(() => node('GamePage').props.onMessage('second', { type: 'gameOver', score: 0 }));
  act(() => node('GamePage').props.onMessage('second', { type: 'completed', score: 10, level: 1 }));
  expect(node('FeedDock').props.visible).toBe(false);
  act(() => node('GamePage').props.onPhase('second', 'ready'));
  advance(10_000);
  expect(node('HomeSwipeTutorial').props.visible).toBe(false);
});

test('an explicitly opened dock survives game changes but automatically hides after five seconds', () => {
  act(() => node('FeedDock').props.onToggle());
  act(() => node('GamePage').props.onPhase('first', 'ready'));
  advance(2_000);
  expect(node('FeedDock').props.visible).toBe(true);
  act(() => node('GamePager').props.onSwipeStart());
  act(() => node('GamePager').props.onIndexChange(1, 1));
  act(() => node('GamePager').props.onSettled(1));
  expect(node('FeedDock').props.visible).toBe(true);
  advance(2_999);
  expect(node('FeedDock').props.visible).toBe(true);
  advance(1);
  expect(node('FeedDock').props.visible).toBe(false);
  advance(20_000);
  expect(node('FeedDock').props.visible).toBe(false);
});

test('dock interaction resets the auto-hide timer without ever revealing a hidden dock', () => {
  act(() => node('FeedDock').props.onToggle());
  advance(4_000);
  act(() => node('FeedDock').props.onLike());
  advance(4_999);
  expect(node('FeedDock').props.visible).toBe(true);
  advance(1);
  expect(node('FeedDock').props.visible).toBe(false);
  act(() => node('GamePage').props.onMessage('first', { type: 'gameStarted' }));
  advance(5_000);
  expect(node('FeedDock').props.visible).toBe(false);
});

test('closing and reopening cancels the old auto-hide deadline', () => {
  act(() => node('FeedDock').props.onToggle());
  advance(4_000);
  act(() => node('FeedDock').props.onToggle());
  expect(node('FeedDock').props.visible).toBe(false);
  act(() => node('FeedDock').props.onToggle());
  advance(1_000);
  expect(node('FeedDock').props.visible).toBe(true);
  advance(4_000);
  expect(node('FeedDock').props.visible).toBe(false);
});
