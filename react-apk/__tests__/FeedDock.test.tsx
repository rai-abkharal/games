import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FeedDock } from '../src/components/feed/FeedDock';
import { THEMES } from '../src/theme/themes';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/i18n/translations', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../src/components/feed/NavIcons', () => ({
  GamepadIcon: () => null, GearIcon: () => null, HeartIcon: () => null, StarIcon: () => null,
}));

let tree: TestRenderer.ReactTestRenderer;
const props = {
  theme: THEMES.eibi_purple,
  visible: false,
  tab: 'all' as const,
  isFavorite: false,
  insetBottom: 0,
  onAllGames: jest.fn(), onLike: jest.fn(), onFavorites: jest.fn(), onSettings: jest.fn(),
  onToggle: jest.fn(),
};
const toggle = () => tree.root.findByProps({ accessibilityLabel: 'Show controls' });

beforeEach(() => {
  jest.clearAllMocks();
  act(() => { tree = TestRenderer.create(<FeedDock {...props} />); });
});
afterEach(() => act(() => tree.unmount()));

test('the overlay includes the entire game stage without blocking unrelated touches', () => {
  const layer = tree.root.findAllByType(View).find(node => node.props.pointerEvents === 'box-none')!;
  expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
  });
  const handle = toggle();
  expect(handle.props.pointerEvents).toBe('box-only');
  expect(handle.props.cancelable).toBe(false);
  const wrap = handle.parent!;
  expect(StyleSheet.flatten(wrap.props.style)).toMatchObject({ padding: handle.props.hitSlop });
});

test.each(['onPressIn', 'onPressOut', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'])(
  '%s consumes the event without triggering the toggle', handler => {
    const event = { stopPropagation: jest.fn() };
    act(() => toggle().props[handler](event));
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(props.onToggle).not.toHaveBeenCalled();
  },
);

test('a completed press consumes the event and toggles exactly once', () => {
  const event = { stopPropagation: jest.fn() };
  act(() => toggle().props.onPress(event));
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(props.onToggle).toHaveBeenCalledTimes(1);
  expect(props.onAllGames).not.toHaveBeenCalled();
});

test('collapsed dock is not a touch target; expanded dock is', () => {
  const bar = () => tree.root.findAll(node =>
    StyleSheet.flatten(node.props.style)?.height === 56 && node.props.collapsable === false,
  )[0];
  expect(bar().props.pointerEvents).toBe('none');
  act(() => { tree.update(<FeedDock {...props} visible />); });
  expect(bar().props.pointerEvents).toBe('auto');
});
