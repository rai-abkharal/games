import React from 'react';
import { Animated } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Splash } from '../src/components/Splash';

jest.mock('../src/components/feed/NavIcons', () => ({ GamepadIcon: () => null }));

let tree: TestRenderer.ReactTestRenderer;
let fades: number;
beforeEach(() => {
  jest.useFakeTimers();
  fades = 0;
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    if (config.toValue === 0) fades++;
    return {
      start: callback => { setTimeout(() => callback?.({ finished: true }), config.duration); },
      stop: () => {}, reset: () => {},
    } as Animated.CompositeAnimation;
  });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('reveals a ready game before the fixed splash deadline, with the original fade duration', async () => {
  const done = jest.fn();
  await act(async () => { tree = TestRenderer.create(<Splash minimumMs={1200} onDone={done} />); });
  await act(async () => { jest.advanceTimersByTime(100); });
  await act(async () => { tree.update(<Splash minimumMs={1200} ready onDone={done} />); });
  expect(done).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(260); });
  expect(done).toHaveBeenCalledTimes(1);
  expect(fades).toBe(1);
});

test('readiness during an existing fade does not restart or extend it', async () => {
  const done = jest.fn();
  await act(async () => { tree = TestRenderer.create(<Splash minimumMs={1200} onDone={done} />); });
  await act(async () => { jest.advanceTimersByTime(1300); });
  await act(async () => { tree.update(<Splash minimumMs={1200} ready onDone={done} />); });
  await act(async () => { jest.advanceTimersByTime(160); });
  expect(done).toHaveBeenCalledTimes(1);
  expect(fades).toBe(1);
});
