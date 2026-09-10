/**
 * Centralised, mobile-safe configuration.
 *
 * Every value here is public: the backend host, the public test AdMob unit ids
 * and timing defaults. Server-side secrets (GA4 API secret, admin credentials)
 * never leave the backend — the app only ever talks to the public
 * /api/games, /api/ads/config and /api/analytics/event endpoints, exactly
 * like the existing native Android client.
 */

/** Same live host the native Android app is pinned to (GameRepository.PRIMARY_HOST). */
const PRIMARY_HOST = '162.243.197.241';

/** Canonical base URL; also the fallback used for URL normalisation. */
export const DEFAULT_BASE_URL = `http://${PRIMARY_HOST}:3000`;

/**
 * Ordered list of base URLs to try when the primary one is unreachable.
 * Mirrors GameRepository.CANDIDATE_ENDPOINTS. The emulator loopback entries
 * only make sense while developing against a local backend, so they are
 * excluded from release builds.
 */
export const CANDIDATE_BASE_URLS: readonly string[] = [
  DEFAULT_BASE_URL,
  `http://${PRIMARY_HOST}`,
  `http://${PRIMARY_HOST}:8080`,
  ...(__DEV__ ? ['http://10.0.2.2:3000', 'http://10.0.2.2:8080'] : []),
];

/** Hosts that the catalogue may reference but which must be rewritten to the active base. */
export const PLACEHOLDER_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '10.0.2.2',
  'games.example.com',
]);

export const API_PATHS = {
  catalog: '/api/games',
  adsConfig: '/api/ads/config',
  analyticsEvent: '/api/analytics/event',
} as const;

export const NETWORK = {
  /** Native client: connect 4 s / read 8 s. One overall budget per attempt here. */
  catalogTimeoutMs: 8000,
  adsConfigTimeoutMs: 6000,
  analyticsTimeoutMs: 6000,
  /** Minimum gap between background catalogue refreshes (MainActivity: 30 s). */
  catalogRefreshIntervalMs: 30_000,
  /** Ads remote config is re-read every 30 s while the app is in the foreground. */
  adsConfigRefreshIntervalMs: 30_000,
  /** How long the game WebView may take before we show the retry state. */
  gameLoadTimeoutMs: 20_000,
} as const;

/**
 * Google's official AdMob *test* identifiers — identical to the native app's
 * compiled-in defaults. Production ids arrive from /api/ads/config and are only
 * honoured in release builds, again mirroring the native behaviour.
 */
export const ADMOB_DEFAULTS = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
  interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
  rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
} as const;

export const GAMEPLAY = {
  /** Starter wallet for a brand-new player (PlayerProgressManager). */
  starterCoins: 100,
  /** Coins granted by a rewarded ad / instant fallback (MainActivity.showRewardedAdForHint). */
  rewardedHintCoins: 50,
  /** Bottom dock auto-hides after this much inactivity. */
  hudAutoHideMs: 5000,
} as const;

export const STORAGE_KEYS = {
  activeBaseUrl: 'sp.activeBaseUrl',
  catalog: 'sp.catalog.v1',
  player: 'sp.player.v1',
  settings: 'sp.settings.v1',
  adsConfig: 'sp.adsConfig.v1',
  adState: 'sp.adState.v1',
  analyticsClientId: 'sp.analytics.clientId',
  analyticsQueue: 'sp.analytics.queue.v1',
} as const;

/**
 * Game feed tuning. The native app keeps ViewPager2.offscreenPageLimit = 1
 * (one live WebView on each side of the current page); everything here exists
 * to reproduce that with the active game always getting first call on the
 * CPU, GPU and network.
 */
export const FEED = {
  /** Wait this long after the active game has loaded before preparing the next one. */
  warmDelayMs: 600,
  /** Prepare the next game anyway if the active one is still loading after this. */
  warmFallbackMs: 3500,
  /** Start in-memory HTML prefetching for further games once the warm page is ready, or after this. */
  prefetchFallbackMs: 2500,
  /** Number of games beyond the warm page whose HTML is fetched into memory. */
  prefetchAhead: 3,
  /** Games larger than this are not prefetched (they load straight from the network). */
  prefetchMaxBytes: 3 * 1024 * 1024,
  /** Total memory budget for prefetched HTML. */
  prefetchBudgetBytes: 8 * 1024 * 1024,
  prefetchTimeoutMs: 15_000,
  /** Frames a freshly loaded background page may still render before its frame gate closes. */
  preloadGraceFrames: 90,
  /** Vertical movement (px) before the pager claims a drag from the game. */
  swipeSlopPx: 12,
  /** Fraction of the page height that must be dragged to change page without a fling. */
  swipeThresholdRatio: 0.22,
  /** Fling velocity (px/ms) that changes page regardless of distance. */
  swipeFlingVelocity: 0.45,
  /** Resistance applied when dragging past the first/last page. */
  overscrollResistance: 0.25,
  overscrollMaxPx: 48,
  /** Settle animation length (ViewPager2 snaps in roughly this time). */
  settleDurationMs: 280,
  /** Floating dock auto-hides after this much inactivity (MainActivity: 5 s). */
  dockAutoHideMs: 5000,
  dockAnimationMs: 260,
} as const;
