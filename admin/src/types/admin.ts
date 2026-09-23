export interface TouchZone {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameVersion {
  id: string;
  version: string;
  sizeBytes: number;
  installedBytes?: number;
  diskBytes?: number;
  fileCount?: number;
  sha256: string;
  status: string;
  rolloutPercent: number;
}

export interface GameItem {
  id: string;
  slug: string;
  title: string;
  /** Name from the uploaded manifest, before any Admin Panel rename. */
  sourceTitle?: string;
  /** Set when an admin has renamed the game; overrides sourceTitle everywhere. */
  titleOverride?: string | null;
  description: string;
  thumbnailUrl: string;
  orientation: string;
  controls: string[];
  tags: string[];
  status: "published" | "draft" | "archived";
  sortWeight: number;
  ageRating: string;
  totalPlays: number;
  totalReports: number;
  touchZones?: TouchZone[];
  features?: { sound?: boolean; vibration?: boolean; hint?: boolean };
  ads?: {
    enabled?: boolean;
    useCustomInterval?: boolean;
    intervalMinutes?: number;
  };
  createdAt?: string;
  updatedAt?: string;
  versions: GameVersion[];
}

export interface ValidationCheck {
  rule: string;
  passed: boolean;
  message: string;
}

export interface ValidationReport {
  gameId: string;
  slug: string;
  version: string;
  allPassed: boolean;
  checks: ValidationCheck[];
}

export interface BridgeLogItem {
  id: string;
  direction: "in" | "out";
  type: string;
  payload: any;
  ts: string;
}

export interface AdsConfig {
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

export interface PreloadConfig {
  initialPreloadGameCount: number;
}

export type TabType =
  | "dashboard"
  | "analytics"
  | "games"
  | "upload"
  | "update"
  | "simulator"
  | "feed"
  | "reports"
  | "gestures"
  | "ads"
  | "preload";

export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const API_BASE = "";

