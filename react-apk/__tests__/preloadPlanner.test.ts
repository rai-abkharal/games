import { clampIndex, isNear, prefetchOrder, slotFor } from '../src/feed/preloadPlanner';

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
  test('targets the immediate next game first in either direction', () => {
    expect(prefetchOrder(5, 1, 30, 3)).toEqual([6, 7, 8]);
    expect(prefetchOrder(5, -1, 30, 3)).toEqual([4, 3, 2]);
  });

  test('stops at the list bounds when not looping', () => {
    expect(prefetchOrder(27, 1, 30, 3)).toEqual([28, 29]);
    expect(prefetchOrder(28, 1, 30, 3)).toEqual([29]);
    expect(prefetchOrder(0, -1, 30, 3)).toEqual([]);
  });

  test('wraps circularly when loop is true', () => {
    expect(prefetchOrder(4, 1, 5, 3, true)).toEqual([0, 1, 2]);
  });

  test('prefetch targets begin with the next cold page', () => {
    // index 0 active, 1..3 are HTML targets after an explicit game end
    expect(prefetchOrder(0, 1, 30, 3)).toEqual([1, 2, 3]);
  });

  test('never targets the page on screen — it is already rendering its document', () => {
    for (const count of [2, 3, 5, 30]) {
      for (let current = 0; current < count; current++) {
        for (const direction of [1, -1] as const) {
          for (const loop of [false, true]) {
            // `ahead` deliberately exceeds the list so a wrap cannot land back
            // on the current index without being caught here.
            expect(prefetchOrder(current, direction, count, count + 2, loop)).not.toContain(current);
          }
        }
      }
    }
  });
});

test('isNear / clampIndex', () => {
  expect(isNear(7, 5)).toBe(true);
  expect(isNear(8, 5)).toBe(false);
  expect(clampIndex(-1, 10)).toBe(0);
  expect(clampIndex(99, 10)).toBe(9);
  expect(clampIndex(3, 0)).toBe(0);
});
