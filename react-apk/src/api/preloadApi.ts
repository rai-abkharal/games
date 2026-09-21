import { API_PATHS, NETWORK } from '../config/env';
import type { PreloadRemoteConfig } from '../types/game';
import { clamp, toInt } from '../utils/misc';
import { requestJsonWithFallback } from './http';

/** Fallback preload configuration matching compile-in defaults. */
export const DEFAULT_PRELOAD_CONFIG: PreloadRemoteConfig = {
  initialPreloadGameCount: 5,
};

/** Coerces whatever the server sent into a range-checked (1..15) config. */
export function normalizePreloadConfig(
  raw: Partial<PreloadRemoteConfig> | null | undefined,
): PreloadRemoteConfig {
  const source = raw ?? {};
  return {
    initialPreloadGameCount: clamp(
      toInt(
        source.initialPreloadGameCount,
        DEFAULT_PRELOAD_CONFIG.initialPreloadGameCount,
      ),
      1,
      15,
    ),
  };
}

/** GET /api/preload/config — Startup Preload Remote Configuration. */
export async function fetchPreloadConfig(
  signal?: AbortSignal | null,
): Promise<PreloadRemoteConfig> {
  const { data } = await requestJsonWithFallback<Partial<PreloadRemoteConfig>>(
    API_PATHS.preloadConfig,
    {
      signal,
      fallback: DEFAULT_PRELOAD_CONFIG,
      timeoutMs: NETWORK.preloadConfigTimeoutMs,
    },
  );
  return normalizePreloadConfig(data);
}
