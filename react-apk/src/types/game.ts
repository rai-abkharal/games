/**
 * Catalogue types. Field names deliberately match the backend's GameSchema and
 * the native app's GameCatalog.kt so no mapping layer is needed.
 */

export interface TouchZone {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameFeatures {
  sound?: boolean;
  vibration?: boolean;
  hint?: boolean;
}

/** Per-game ad override configured in the Admin Panel. */
export interface GameAdsConfig {
  enabled: boolean;
  useCustomInterval: boolean;
  intervalMinutes: number;
}

export type GameStatus = 'published' | 'draft' | 'archived' | 'deactivated';

export interface GameItem {
  id: string;
  /** Effective display name — already resolved server-side (admin override wins). */
  title: string;
  sourceTitle?: string;
  titleOverride?: string | null;
  version: string;
  entryUrl: string;
  thumbnailUrl: string;
  sizeBytes: number;
  orientation: 'portrait' | 'landscape';
  engine: string;
  manifestUrl: string;
  feedOrder: number;
  category: string;
  description: string;
  sha256?: string;
  controls?: string[];
  tags?: string[];
  ageRating?: string;
  status?: GameStatus;
  touchZones?: TouchZone[];
  features?: GameFeatures;
  ads?: GameAdsConfig | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GameCatalog {
  version: number;
  updatedAt?: string;
  games: GameItem[];
}

/** Remote ads configuration served by /api/ads/config. */
export interface AdsRemoteConfig {
  bannerEnabled: boolean;
  interstitialEnabled: boolean;
  swipeInterval: number;
  defaultIntervalMinutes: number;
  levelCompleteAd: boolean;
  levelWinInterval: number;
  gameOverAdEnabled: boolean;
  cooldownSeconds: number;
  adMobAppId: string;
  bannerUnitId: string;
  interstitialUnitId: string;
  rewardedUnitId: string;
  gaMeasurementId: string;
}

export type AnalyticsEventName =
  | 'game_start'
  | 'game_exit'
  | 'game_session_duration'
  | 'game_over'
  | 'game_completed'
  | 'ad_impression';
