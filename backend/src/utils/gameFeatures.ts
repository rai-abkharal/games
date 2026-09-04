export type NormalizedGameFeatures = {
  sound: boolean;
  vibration: boolean;
  hint: boolean;
};

/**
 * Keep catalogue metadata compatible with native clients. Older uploaded
 * manifests sometimes used a string array here, while the public API contract
 * requires an object of boolean feature flags.
 */
export function normalizeGameFeatures(value: unknown): NormalizedGameFeatures {
  const legacyTags = Array.isArray(value)
    ? value.map(item => String(item).toLowerCase())
    : [];
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    sound: typeof source.sound === 'boolean' ? source.sound : true,
    vibration: typeof source.vibration === 'boolean'
      ? source.vibration
      : legacyTags.some(tag => tag.includes('vibration') || tag.includes('haptic')),
    hint: typeof source.hint === 'boolean'
      ? source.hint
      : legacyTags.some(tag => tag.includes('hint')),
  };
}
