import { dragAxis, dragOffset, pointInZones, resolveTarget, settleDuration, shouldClaimSwipe } from '../src/feed/pagerGesture';

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
  test('a touch the game already owns never becomes a swipe, even once it turns vertical', () => {
    expect(shouldClaimSwipe({ ...base, dx: 30, dy: -120, gameOwnsTouch: true })).toBe(false);
  });
});

describe('dragAxis (decided once per touch)', () => {
  test('inside the slop nothing is decided', () => {
    expect(dragAxis(5, -8, 12)).toBe('none');
    expect(dragAxis(0, 0, 12)).toBe('none');
  });
  test('the dominant axis wins once the slop is left', () => {
    expect(dragAxis(14, 3, 12)).toBe('horizontal');
    expect(dragAxis(-20, 10, 12)).toBe('horizontal');
    expect(dragAxis(4, -13, 12)).toBe('vertical');
  });
  test('a perfect diagonal stays with the game', () => {
    expect(dragAxis(15, 15, 12)).toBe('horizontal');
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
  test('loop mode allows dragging past boundaries without resistance', () => {
    expect(dragOffset({ ...opts, dy: 300, current: 0, loop: true })).toBe(300);
    expect(dragOffset({ ...opts, dy: -300, current: 9, loop: true })).toBe(-300);
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
  test('never leaves the list when loop is false', () => {
    expect(resolveTarget({ ...opts, dy: 400, vy: 2, current: 0 })).toBe(0);
    expect(resolveTarget({ ...opts, dy: -400, vy: -2, current: 9 })).toBe(9);
    expect(resolveTarget({ ...opts, count: 1, dy: -400, vy: -2, current: 0 })).toBe(0);
  });
  test('allows crossing boundaries when loop is true', () => {
    expect(resolveTarget({ ...opts, dy: 400, vy: 2, current: 0, loop: true })).toBe(-1);
    expect(resolveTarget({ ...opts, dy: -400, vy: -2, current: 9, loop: true })).toBe(10);
  });
});

describe('settleDuration (snap continues the finger)', () => {
  const opts = { pageHeight: PAGE, baseMs: 240, minMs: 100 };
  test('a full page without a fling takes the base duration', () => {
    expect(settleDuration({ ...opts, distance: -PAGE, velocity: 0 })).toBe(240);
  });
  test('short distances snap faster, down to a floor', () => {
    expect(settleDuration({ ...opts, distance: 100, velocity: 0 })).toBe(132);
  });
  test('a fling faster than the default snap shortens it to match the finger', () => {
    // ease-out cubic starts at 3 × 500 / 150 = 10 px/ms — the finger's speed
    expect(settleDuration({ ...opts, distance: 500, velocity: 10 })).toBe(150);
    expect(settleDuration({ ...opts, distance: 500, velocity: 50 })).toBe(100);
  });
  test('a finger moving away or slower than the snap does not slow it down', () => {
    expect(settleDuration({ ...opts, distance: 500, velocity: -5 })).toBe(170);
    expect(settleDuration({ ...opts, distance: 500, velocity: 0.5 })).toBe(170);
  });
  test('nothing left to travel', () => {
    expect(settleDuration({ ...opts, distance: 0.4, velocity: 3 })).toBe(0);
  });
});
