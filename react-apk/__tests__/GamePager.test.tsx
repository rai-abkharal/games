import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { GamePager } from '../src/components/feed/GamePager';

const mockTimings: Array<{ done: (finished: boolean) => void }> = [];
const mockShared: Array<{ value: any }> = [];
const mockPan: Record<string, (...args: any[]) => void> = {};

jest.mock('react-native-reanimated', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: { View: 'AnimatedPage' },
    useSharedValue: (initial: unknown) => {
      const ref = ReactModule.useRef(null);
      if (!ref.current) {
        ref.current = { value: initial };
        mockShared.push(ref.current);
      }
      return ref.current;
    },
    useAnimatedStyle: (style: () => unknown) => style(),
    cancelAnimation: jest.fn(),
    Easing: { out: (value: unknown) => value, cubic: 'cubic' },
    // Deliberately never run completion automatically: this reproduces a
    // missing/interrupted native animation completion rather than hiding it.
    withTiming: (value: number, _config: unknown, done: (finished: boolean) => void) => {
      mockTimings.push({ done });
      return value;
    },
  };
});
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: (...args: any[]) => void, ...args: any[]) => callback(...args),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const chain: Record<string, any> = {};
      for (const name of ['enabled', 'manualActivation', 'onTouchesDown', 'onTouchesMove', 'onStart', 'onUpdate', 'onFinalize']) {
        chain[name] = (value: any) => {
          if (typeof value === 'function') mockPan[name] = value;
          return chain;
        };
      }
      return chain;
    },
  },
}));

let tree: TestRenderer.ReactTestRenderer;
const props = {
  count: 3,
  index: 0,
  pageHeight: 800,
  width: 400,
  swipeEnabled: true,
  touchZonesFor: () => undefined,
  onIndexChange: jest.fn(),
  onSettled: jest.fn(),
  onBusyChange: jest.fn(),
  onSwipeStart: jest.fn(),
  renderPage: (index: number) => React.createElement('GameContent', { index }),
};
const pages = () => tree.root.findAll(node => String(node.type) === 'GameContent').map(node => node.props.index);

beforeEach(() => {
  jest.clearAllMocks();
  mockShared.length = 0;
  mockTimings.length = 0;
});
afterEach(() => { if (tree) act(() => tree.unmount()); });

test('Arrow → Knife → Water commits the mounted window without animation callbacks', () => {
  act(() => { tree = TestRenderer.create(<GamePager {...props} />); });
  act(() => { tree.update(<GamePager {...props} index={1} />); });
  act(() => { tree.update(<GamePager {...props} index={2} />); });
  expect(pages()).toEqual([1, 2]);
  expect(mockShared[0].value).toBe(-1600);
  expect(props.onSettled).toHaveBeenLastCalledWith(2);
  expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
  expect(props.onIndexChange).not.toHaveBeenCalled();
  expect(mockTimings).toHaveLength(0);
});

test('Water remains mounted and aligned after a viewport resize', () => {
  act(() => { tree = TestRenderer.create(<GamePager {...props} index={1} />); });
  act(() => { tree.update(<GamePager {...props} index={2} />); });
  act(() => { tree.update(<GamePager {...props} index={2} pageHeight={720} />); });
  expect(pages()).toEqual([1, 2]);
  expect(mockShared[0].value).toBe(-1440);
  expect(props.onSettled).toHaveBeenLastCalledWith(2);
});

test('direct controlled jump mounts Water even outside the previous page window', () => {
  act(() => { tree = TestRenderer.create(<GamePager {...props} />); });
  act(() => { tree.update(<GamePager {...props} index={2} />); });
  expect(pages()).toEqual([1, 2]);
  expect(mockShared[0].value).toBe(-1600);
});

test('normal looping swipe still animates and preserves its virtual page on resize', () => {
  const onIndexChange = jest.fn((index: number) => {
    tree.update(<GamePager {...props} loop index={index} onIndexChange={onIndexChange} />);
  });
  act(() => { tree = TestRenderer.create(<GamePager {...props} loop index={2} onIndexChange={onIndexChange} />); });
  act(() => {
    mockPan.onStart({ translationY: 0 });
    mockPan.onUpdate({ translationY: -600 });
    mockPan.onFinalize({ velocityY: -1000 }, true);
  });
  expect(mockTimings).toHaveLength(1);
  expect(onIndexChange).not.toHaveBeenCalled();
  act(() => { mockTimings[0].done(true); });
  expect(onIndexChange).toHaveBeenCalledWith(0, 1);
  expect(mockShared[0].value).toBe(-2400);
  act(() => { tree.update(<GamePager {...props} loop index={0} pageHeight={720} onIndexChange={onIndexChange} />); });
  expect(mockShared[0].value).toBe(-2160);
});
