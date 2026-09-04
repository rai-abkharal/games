import { describe, expect, it } from 'vitest';
import { normalizeGameFeatures } from '../src/utils/gameFeatures';

describe('normalizeGameFeatures', () => {
  it('converts legacy feature arrays into the public object contract', () => {
    expect(normalizeGameFeatures(['offline-capable', 'touch-support'])).toEqual({
      sound: true,
      vibration: false,
      hint: false,
    });
  });

  it('preserves supported boolean feature flags and removes unknown values', () => {
    expect(normalizeGameFeatures({
      0: 'offline-capable',
      sound: false,
      vibration: true,
      hint: true,
    })).toEqual({
      sound: false,
      vibration: true,
      hint: true,
    });
  });
});
