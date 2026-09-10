import { dragOffset, pointInZones, resolveTarget, shouldClaimSwipe } from '../src/feed/pagerGesture';

const PAGE = 1000;

describe('pointInZones (GameFeedAdapter touch zones)', () => {
  const zones = [{ name: 'gameplay', x: 0, y: 0.15, width: 1, height: 0.7 }];
  test('inside / outside', () => {
    expect(pointInZones(0.5, 0.5, zones)).toBe(true);
    expect(pointInZones(0.5, 0.05, zones)).toBe(false);
    expect(pointInZones(0.5, 0.9, zones)).toBe(false);
  });
  test('no zones never blocks', () => {
    expect(pointInZones(0.5, 0.5, [])).toBe(false);
    expect(pointInZones(0.5, 0.5, undefined)).toBe(false);
  });
});

describe('shouldClaimSwipe (RecyclerView slop + dominant axis)', () => {
  const base = { slopPx: 12, enabled: true, startedInZone: false };
  test('clearly vertical drags become swipes', () => {
    expect(shouldClaimSwipe({ ...base, dx: 2, dy: -20 })).toBe(true);
    expect(shouldClaimSwipe({ ...base, dx: -3, dy: 30 })).toBe(true);
  });
  test('horizontal-dominant or tiny drags stay with the game', () => {
    expect(shouldClaimSwipe({ ...base, dx: 40, dy: -20 })).toBe(false);
    expect(shouldClaimSwipe({ ...base, dx: 0, dy: -8 })).toBe(false);
  });
  test('blocked zones and setSwipeEnabled(false) win', () => {
    expect(shouldClaimSwipe({ ...base, dx: 0, dy: -50, startedInZone: true })).toBe(false);
    expect(shouldClaimSwipe({ ...base, dx: 0, dy: -50, enabled: false })).toBe(false);
  });
});

describe('dragOffset', () => {
  const opts = { count: 10, pageHeight: PAGE, resistance: 0.25, maxOverscroll: 48 };
  test('moves with the finger, one page at most', () => {
    expect(dragOffset({ ...opts, dy: -300, current: 4 })).toBe(-300);
    expect(dragOffset({ ...opts, dy: -5000, current: 4 })).toBe(-PAGE);
  });
  test('resists past the first and last page', () => {
    expect(dragOffset({ ...opts, dy: 100, current: 0 })).toBe(25);
    expect(dragOffset({ ...opts, dy: 1000, current: 0 })).toBe(48);
    expect(dragOffset({ ...opts, dy: -100, current: 9 })).toBe(-25);
  });
});

describe('resolveTarget (one page per gesture)', () => {
  const opts = { count: 10, pageHeight: PAGE, thresholdRatio: 0.22, flingVelocity: 0.45 };
  test('fling up goes to the next page, fling down to the previous', () => {
    expect(resolveTarget({ ...opts, dy: -40, vy: -1.2, current: 4 })).toBe(5);
    expect(resolveTarget({ ...opts, dy: 40, vy: 1.2, current: 4 })).toBe(3);
  });
  test('a long drag without a fling also changes page; a short one snaps back', () => {
    expect(resolveTarget({ ...opts, dy: -300, vy: 0, current: 4 })).toBe(5);
    expect(resolveTarget({ ...opts, dy: -100, vy: 0.1, current: 4 })).toBe(4);
  });
  test('a fling against the drag direction does not jump', () => {
    expect(resolveTarget({ ...opts, dy: -100, vy: 1.5, current: 4 })).toBe(4);
  });
  test('never leaves the list', () => {
    expect(resolveTarget({ ...opts, dy: 400, vy: 2, current: 0 })).toBe(0);
    expect(resolveTarget({ ...opts, dy: -400, vy: -2, current: 9 })).toBe(9);
    expect(resolveTarget({ ...opts, count: 1, dy: -400, vy: -2, current: 0 })).toBe(0);
  });
});
