import { clampIndex, isNear, prefetchOrder, retainWindow, slotFor } from '../src/feed/preloadPlanner';

describe('slotFor (ViewPager2 offscreenPageLimit = 1 semantics)', () => {
  test('forward travel: current, next ahead, previous behind, rest far', () => {
    expect(slotFor(5, 5, 1)).toBe('active');
    expect(slotFor(6, 5, 1)).toBe('ahead');
    expect(slotFor(4, 5, 1)).toBe('behind');
    expect(slotFor(7, 5, 1)).toBe('far');
    expect(slotFor(3, 5, 1)).toBe('far');
  });

  test('backward travel flips ahead/behind', () => {
    expect(slotFor(4, 5, -1)).toBe('ahead');
    expect(slotFor(6, 5, -1)).toBe('behind');
  });
  test('looping slotFor wraps cleanly around edges', () => {
    expect(slotFor(0, 4, 1, 5)).toBe('ahead');
    expect(slotFor(3, 4, 1, 5)).toBe('behind');
    expect(slotFor(4, 0, -1, 5)).toBe('ahead');
    expect(slotFor(1, 0, -1, 5)).toBe('behind');
  });
});

describe('prefetchOrder', () => {
  test('targets the games beyond the warm page, nearest first', () => {
    expect(prefetchOrder(5, 1, 30, 3)).toEqual([7, 8, 9]);
    expect(prefetchOrder(5, -1, 30, 3)).toEqual([3, 2, 1]);
  });

  test('stops at the list bounds when not looping', () => {
    expect(prefetchOrder(27, 1, 30, 3)).toEqual([29]);
    expect(prefetchOrder(28, 1, 30, 3)).toEqual([]);
    expect(prefetchOrder(0, -1, 30, 3)).toEqual([]);
  });

  test('wraps circularly when loop is true', () => {
    expect(prefetchOrder(4, 1, 5, 3, true)).toEqual([1, 2, 3]);
  });

  test('first five games are covered at launch: active, warm, and three prefetched', () => {
    // index 0 active, 1 warm (live WebView), 2..4 HTML in memory
    expect(prefetchOrder(0, 1, 30, 3)).toEqual([2, 3, 4]);
  });
});

describe('retainWindow', () => {
  test('keeps the live triple plus prefetch targets', () => {
    expect(retainWindow(5, 1, 30, 3)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  test('small lists', () => {
    expect(retainWindow(0, 1, 3, 3)).toEqual([0, 1, 2]);
    expect(retainWindow(0, 1, 1, 3)).toEqual([0]);
  });

  test('circular retainWindow wraps boundaries', () => {
    expect(retainWindow(0, 1, 5, 3, true)).toEqual([0, 1, 2, 3, 4]);
  });
});

test('isNear / clampIndex', () => {
  expect(isNear(7, 5)).toBe(true);
  expect(isNear(8, 5)).toBe(false);
  expect(clampIndex(-1, 10)).toBe(0);
  expect(clampIndex(99, 10)).toBe(9);
  expect(clampIndex(3, 0)).toBe(0);
});
