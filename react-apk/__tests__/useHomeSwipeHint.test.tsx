import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useHomeSwipeHint } from '../src/hooks/useHomeSwipeHint';

function Hint({ gameId = 'first-game', eligible = true }) {
  const visible = useHomeSwipeHint(gameId, eligible);
  return React.createElement('Hint', { visible });
}

let tree: TestRenderer.ReactTestRenderer;
const visible = () => tree.root.findByType('Hint' as any).props.visible;
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => tree?.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('starts exactly ten seconds after the home game becomes eligible', () => {
  act(() => { tree = TestRenderer.create(<Hint eligible={false} />); });
  advance(30_000);
  expect(visible()).toBe(false);
  act(() => { tree.update(<Hint />); });
  advance(9_999);
  expect(visible()).toBe(false);
  advance(1);
  expect(visible()).toBe(true);
});

test('unrelated rerenders do not restart the countdown', () => {
  act(() => { tree = TestRenderer.create(<Hint />); });
  advance(6_000);
  act(() => { tree.update(<Hint />); });
  advance(4_000);
  expect(visible()).toBe(true);
});

test('losing eligibility cancels a pending hint and requires a fresh active interval', () => {
    act(() => { tree = TestRenderer.create(<Hint />); });
    advance(8_000);
    act(() => { tree.update(<Hint eligible={false} />); });
    advance(20_000);
    expect(visible()).toBe(false);
    act(() => { tree.update(<Hint />); });
    advance(9_999);
    expect(visible()).toBe(false);
    advance(1);
    expect(visible()).toBe(true);
});

test('a different game cannot inherit the previous game countdown', () => {
  act(() => { tree = TestRenderer.create(<Hint />); });
  advance(9_000);
  act(() => { tree.update(<Hint gameId="next-game" />); });
  advance(1_000);
  expect(visible()).toBe(false);
  advance(9_000);
  expect(visible()).toBe(true);
});

test('ineligibility hides an already-visible hint', () => {
  act(() => { tree = TestRenderer.create(<Hint />); });
  advance(10_000);
  expect(visible()).toBe(true);
  act(() => { tree.update(<Hint eligible={false} />); });
  expect(visible()).toBe(false);
});

test('unmount clears a pending timer', () => {
  act(() => { tree = TestRenderer.create(<Hint />); });
  expect(jest.getTimerCount()).toBe(1);
  act(() => tree.unmount());
  expect(jest.getTimerCount()).toBe(0);
});
