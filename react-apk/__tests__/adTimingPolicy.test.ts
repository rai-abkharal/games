import { intervalMs, isAdDue, restoredAnchor } from '../src/services/adTimingPolicy';

describe('adTimingPolicy (parity with native AdTimingPolicy)', () => {
  test('restoredAnchor keeps a sane saved timestamp and resets a bogus one', () => {
    const now = 1_000_000;
    expect(restoredAnchor(500_000, now)).toBe(500_000);
    expect(restoredAnchor(0, now)).toBe(now);
    expect(restoredAnchor(now + 1, now)).toBe(now);
  });

  test('intervalMs clamps to 1..1440 minutes', () => {
    expect(intervalMs(0)).toBe(60_000);
    expect(intervalMs(5)).toBe(300_000);
    expect(intervalMs(99_999)).toBe(1440 * 60_000);
  });

  test('interval elapsed is always due', () => {
    expect(isAdDue(5 * 60_000, 5, 60, false)).toBe(true);
  });

  test('event trigger is honoured only after the cooldown', () => {
    expect(isAdDue(30_000, 5, 60, true)).toBe(false);
    expect(isAdDue(61_000, 5, 60, true)).toBe(true);
    expect(isAdDue(61_000, 5, 60, false)).toBe(false);
  });

  test('cooldown never exceeds the interval', () => {
    // cooldown 300 s but interval 1 min → event due at 60 s
    expect(isAdDue(60_000, 1, 300, true)).toBe(true);
  });
});
