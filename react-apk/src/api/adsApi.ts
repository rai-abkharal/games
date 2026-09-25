import { ADMOB_DEFAULTS, API_PATHS, NETWORK } from '../config/env';
import type { AdsRemoteConfig } from '../types/game';
import { clamp, toInt } from '../utils/misc';
import { requestJsonWithFallback } from './http';

/**
 * Default fallback configuration.
 * Ad unit IDs start empty: ads are only requested when valid production IDs
 * are supplied from the Admin Panel via /api/ads/config.
 */
export const DEFAULT_ADS_CONFIG: AdsRemoteConfig = {
  bannerEnabled: true,
  interstitialEnabled: true,
  swipeInterval: 10,
  defaultIntervalMinutes: 5,
  levelCompleteAd: true,
  levelWinInterval: 2,
  gameOverAdEnabled: true,
  cooldownSeconds: 60,
  adMobAppId: '',
  bannerUnitId: '',
  interstitialUnitId: '',
  rewardedUnitId: '',
  gaMeasurementId: 'G-SWIPEPLAY1',
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;
const str = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

/** Coerces whatever the server sent into a fully-populated, range-checked config. */
export function normalizeAdsConfig(raw: Partial<AdsRemoteConfig> | null | undefined): AdsRemoteConfig {
  const source = raw ?? {};
  return {
    bannerEnabled: bool(source.bannerEnabled, DEFAULT_ADS_CONFIG.bannerEnabled),
    interstitialEnabled: bool(source.interstitialEnabled, DEFAULT_ADS_CONFIG.interstitialEnabled),
    swipeInterval: Math.max(1, toInt(source.swipeInterval, DEFAULT_ADS_CONFIG.swipeInterval)),
    defaultIntervalMinutes: clamp(
      toInt(source.defaultIntervalMinutes, DEFAULT_ADS_CONFIG.defaultIntervalMinutes),
      1,
      1440,
    ),
    levelCompleteAd: bool(source.levelCompleteAd, DEFAULT_ADS_CONFIG.levelCompleteAd),
    levelWinInterval: Math.max(1, toInt(source.levelWinInterval, DEFAULT_ADS_CONFIG.levelWinInterval)),
    gameOverAdEnabled: bool(source.gameOverAdEnabled, DEFAULT_ADS_CONFIG.gameOverAdEnabled),
    cooldownSeconds: Math.max(0, toInt(source.cooldownSeconds, DEFAULT_ADS_CONFIG.cooldownSeconds)),
    adMobAppId: str(source.adMobAppId, DEFAULT_ADS_CONFIG.adMobAppId),
    bannerUnitId: str(source.bannerUnitId, DEFAULT_ADS_CONFIG.bannerUnitId),
    interstitialUnitId: str(source.interstitialUnitId, DEFAULT_ADS_CONFIG.interstitialUnitId),
    rewardedUnitId: str(source.rewardedUnitId, DEFAULT_ADS_CONFIG.rewardedUnitId),
    gaMeasurementId: str(source.gaMeasurementId, DEFAULT_ADS_CONFIG.gaMeasurementId),
  };
}

/** GET /api/ads/config — Admin Panel "Ads & Monetization" remote config. */
export async function fetchAdsConfig(signal?: AbortSignal | null): Promise<AdsRemoteConfig> {
  const { data } = await requestJsonWithFallback<Partial<AdsRemoteConfig>>(API_PATHS.adsConfig, {
    timeoutMs: NETWORK.adsConfigTimeoutMs,
    signal,
  });
  return normalizeAdsConfig(data);
}
