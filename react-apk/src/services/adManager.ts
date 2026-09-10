import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import mobileAds, {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { create } from 'zustand';
import { DEFAULT_ADS_CONFIG, fetchAdsConfig, normalizeAdsConfig } from '../api/adsApi';
import { ADMOB_DEFAULTS, NETWORK, STORAGE_KEYS } from '../config/env';
import type { AdsRemoteConfig, GameItem } from '../types/game';
import { isAdDue, restoredAnchor } from './adTimingPolicy';
import { analytics } from './analytics';
import { readJson, writeJson } from './storage';

/** UI-facing slice; components subscribe to this, the manager owns the rest. */
interface AdsUiState {
  bannerEnabled: boolean;
  bannerUnitId: string;
  fullScreenAdShowing: boolean;
}

export const useAdsStore = create<AdsUiState>(() => ({
  bannerEnabled: DEFAULT_ADS_CONFIG.bannerEnabled,
  bannerUnitId: ADMOB_DEFAULTS.bannerUnitId,
  fullScreenAdShowing: false,
}));

interface PersistedAdState {
  lastAdShownAt: number;
  defaultIntervalMinutes: number;
}

const RETRY_BACKOFF_MS = 30_000;
const TICK_MS = 2000;

/**
 * Port of the ad orchestration in MainActivity:
 *  - remote config from /api/ads/config (cached, re-read every 30 s in foreground)
 *  - interstitial preloading with 30 s back-off after failures
 *  - "due" decisions via AdTimingPolicy using the per-game override or the
 *    remote default interval, with swipe / level-win / game-over triggers
 *  - rewarded ad for hints with the same instant-fallback reward
 *  - the last-shown timestamp survives restarts so intervals aren't reset
 *
 * Unit ids from the server are only honoured in release builds; debug builds
 * always use Google's test units, exactly like the native client.
 */
class AdManager {
  private config: AdsRemoteConfig = DEFAULT_ADS_CONFIG;
  private interstitial: InterstitialAd | null = null;
  private interstitialUnsubs: Array<() => void> = [];
  private interstitialLoading = false;
  private interstitialUnitId: string = ADMOB_DEFAULTS.interstitialUnitId;
  private rewarded: RewardedAd | null = null;
  private rewardedUnsubs: Array<() => void> = [];
  private rewardedUnitId: string = ADMOB_DEFAULTS.rewardedUnitId;
  private rewardedLoading = false;
  private pendingReward: ((granted: boolean) => void) | null = null;

  private lastAdShownAt = Date.now();
  private nextLoadAttemptAt = 0;
  private swipeCount = 0;
  private levelWinCount = 0;
  private adDue = false;
  private appActive = true;
  private currentGame: GameItem | null = null;
  private lastConfigFetchAt = 0;
  private configInflight: Promise<void> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private appStateSub: NativeEventSubscription | null = null;
  private started = false;
  private sdkReady = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const [saved, savedConfig] = await Promise.all([
      readJson<PersistedAdState>(STORAGE_KEYS.adState),
      readJson<Partial<AdsRemoteConfig>>(STORAGE_KEYS.adsConfig),
    ]);
    const now = Date.now();
    this.lastAdShownAt = restoredAnchor(saved?.lastAdShownAt ?? 0, now);
    if (savedConfig) this.applyConfig(normalizeAdsConfig(savedConfig));
    this.persistState();

    try {
      await mobileAds().initialize();
      this.sdkReady = true;
    } catch {
      // The SDK failing to initialise must never block gameplay; we simply
      // won't show ads this session.
      this.sdkReady = false;
    }

    this.appStateSub = AppState.addEventListener('change', this.onAppState);
    this.appActive = AppState.currentState !== 'background';
    void this.refreshConfig();
    this.loadInterstitial();
    this.loadRewarded();
    this.startTicker();
  }

  stop(): void {
    this.stopTicker();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.disposeInterstitial();
    this.disposeRewarded();
    this.started = false;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  private onAppState = (status: AppStateStatus) => {
    const active = status === 'active';
    if (active === this.appActive) return;
    this.appActive = active;
    if (active) {
      analytics.resumeAfterAd();
      void this.refreshConfig();
      this.startTicker();
    } else {
      if (useAdsStore.getState().fullScreenAdShowing) analytics.pauseForAd();
      this.stopTicker();
    }
  };

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (!this.appActive || useAdsStore.getState().fullScreenAdShowing) return;
      if (Date.now() - this.lastConfigFetchAt >= NETWORK.adsConfigRefreshIntervalMs) {
        void this.refreshConfig();
      }
      if (this.currentGame) this.check(false);
    }, TICK_MS);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /* ---------------------------------------------------------------- */
  /* Remote configuration                                             */
  /* ---------------------------------------------------------------- */

  async refreshConfig(): Promise<void> {
    if (this.configInflight) return this.configInflight;
    this.lastConfigFetchAt = Date.now();
    this.configInflight = (async () => {
      try {
        const config = await fetchAdsConfig();
        writeJson(STORAGE_KEYS.adsConfig, config, 0);
        this.applyConfig(config);
        this.loadInterstitial();
        if (!this.rewarded) this.loadRewarded();
        this.check(false);
      } catch {
        // Keep the cached/previous configuration; retried on the next tick window.
      } finally {
        this.configInflight = null;
      }
    })();
    return this.configInflight;
  }

  private applyConfig(config: AdsRemoteConfig) {
    const previousInterstitial = this.interstitialUnitId;
    const previousRewarded = this.rewardedUnitId;
    this.config = config;

    // Debuggable builds never load production units (MainActivity.fetchRemoteAdsConfig).
    const bannerUnitId = __DEV__ ? ADMOB_DEFAULTS.bannerUnitId : config.bannerUnitId;
    this.interstitialUnitId = __DEV__ ? ADMOB_DEFAULTS.interstitialUnitId : config.interstitialUnitId;
    this.rewardedUnitId = __DEV__ ? ADMOB_DEFAULTS.rewardedUnitId : config.rewardedUnitId;

    if (previousInterstitial !== this.interstitialUnitId) this.disposeInterstitial();
    if (previousRewarded !== this.rewardedUnitId) this.disposeRewarded();

    useAdsStore.setState({ bannerEnabled: config.bannerEnabled, bannerUnitId });
    this.persistState();
  }

  getConfig(): AdsRemoteConfig {
    return this.config;
  }

  /* ---------------------------------------------------------------- */
  /* Game context & triggers                                          */
  /* ---------------------------------------------------------------- */

  /** Called whenever the game on screen changes (or becomes null when leaving the player). */
  setCurrentGame(game: GameItem | null): void {
    const changed = game?.id !== this.currentGame?.id;
    this.currentGame = game;
    if (game && changed) {
      // Every game switch is a "swipe" for the swipeInterval trigger.
      this.swipeCount += 1;
      this.check(false);
    }
  }

  onGameOver(): void {
    if (this.config.gameOverAdEnabled || this.adDue) this.check(true);
  }

  onLevelCompleted(): void {
    this.levelWinCount += 1;
    const thresholdMet = this.config.levelCompleteAd && this.levelWinCount >= this.config.levelWinInterval;
    if (thresholdMet || this.adDue) {
      this.check(true);
      this.levelWinCount = 0;
    }
  }

  /** Native shows an interstitial (if due) when Settings is opened. */
  onNavigationEvent(): void {
    this.check(false);
  }

  /**
   * MainActivity.checkAndShowInterstitialAd. Shows immediately when an ad is
   * loaded, otherwise marks it due and requests a preload so it appears as
   * soon as it arrives.
   */
  private check(forceIfDue: boolean): void {
    if (!this.sdkReady || !this.config.interstitialEnabled || !this.appActive) return;
    if (useAdsStore.getState().fullScreenAdShowing) return;
    const game = this.currentGame;
    if (!game) return;
    if (game.ads?.enabled === false) return;

    const minutes = game.ads?.useCustomInterval ? game.ads.intervalMinutes : this.config.defaultIntervalMinutes;
    const elapsed = Date.now() - this.lastAdShownAt;
    const swipeDue = this.config.swipeInterval > 0 && this.swipeCount >= this.config.swipeInterval;
    if (!isAdDue(elapsed, minutes, this.config.cooldownSeconds, forceIfDue || swipeDue)) return;

    if (this.interstitial?.loaded) {
      this.adDue = false;
      const ready = this.interstitial;
      useAdsStore.setState({ fullScreenAdShowing: true });
      analytics.pauseForAd();
      ready.show().catch(() => {
        useAdsStore.setState({ fullScreenAdShowing: false });
        analytics.resumeAfterAd();
        this.disposeInterstitial();
        this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
        this.loadInterstitial();
      });
    } else {
      this.adDue = true;
      this.loadInterstitial();
    }
  }

  private recordAdShown() {
    this.lastAdShownAt = Date.now();
    this.swipeCount = 0;
    this.adDue = false;
    this.persistState();
  }

  private persistState() {
    writeJson(STORAGE_KEYS.adState, {
      lastAdShownAt: this.lastAdShownAt,
      defaultIntervalMinutes: this.config.defaultIntervalMinutes,
    } satisfies PersistedAdState);
  }

  /* ---------------------------------------------------------------- */
  /* Interstitial                                                     */
  /* ---------------------------------------------------------------- */

  private loadInterstitial(): void {
    if (
      !this.sdkReady ||
      !this.config.interstitialEnabled ||
      this.interstitialLoading ||
      this.interstitial?.loaded ||
      useAdsStore.getState().fullScreenAdShowing ||
      Date.now() < this.nextLoadAttemptAt
    ) {
      return;
    }
    this.disposeInterstitial();
    const unitId = this.interstitialUnitId;
    const ad = InterstitialAd.createForAdRequest(unitId);
    this.interstitial = ad;
    this.interstitialLoading = true;

    this.interstitialUnsubs = [
      ad.addAdEventListener(AdEventType.LOADED, () => {
        this.interstitialLoading = false;
        if (unitId !== this.interstitialUnitId) {
          this.disposeInterstitial();
          this.loadInterstitial();
          return;
        }
        if (this.adDue && this.currentGame?.ads?.enabled !== false) this.check(false);
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        this.interstitialLoading = false;
        this.disposeInterstitial();
        this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
      }),
      ad.addAdEventListener(AdEventType.OPENED, () => {
        this.recordAdShown();
        if (this.currentGame) analytics.onAdImpression(this.currentGame.id, this.currentGame.title);
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        useAdsStore.setState({ fullScreenAdShowing: false });
        analytics.resumeAfterAd();
        this.disposeInterstitial();
        this.loadInterstitial();
      }),
    ];
    ad.load();
  }

  private disposeInterstitial() {
    this.interstitialUnsubs.forEach(unsub => unsub());
    this.interstitialUnsubs = [];
    this.interstitial = null;
    this.interstitialLoading = false;
  }

  /* ---------------------------------------------------------------- */
  /* Rewarded (hints)                                                 */
  /* ---------------------------------------------------------------- */

  private loadRewarded(): void {
    if (!this.sdkReady || this.rewardedLoading || this.rewarded?.loaded) return;
    this.disposeRewarded();
    const ad = RewardedAd.createForAdRequest(this.rewardedUnitId);
    this.rewarded = ad;
    this.rewardedLoading = true;
    let earned = false;
    this.rewardedUnsubs = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        this.rewardedLoading = false;
      }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(AdEventType.ERROR, () => {
        this.rewardedLoading = false;
        this.disposeRewarded();
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        useAdsStore.setState({ fullScreenAdShowing: false });
        analytics.resumeAfterAd();
        const resolve = this.pendingReward;
        this.pendingReward = null;
        this.disposeRewarded();
        this.loadRewarded();
        resolve?.(earned);
      }),
    ];
    ad.load();
  }

  private disposeRewarded() {
    this.rewardedUnsubs.forEach(unsub => unsub());
    this.rewardedUnsubs = [];
    this.rewarded = null;
    this.rewardedLoading = false;
  }

  /**
   * Shows a rewarded ad if one is ready. When none is loaded the native app
   * grants the reward instantly rather than making the player wait, and we do
   * the same. Resolves with `{ granted, viaAd }` once the flow completes.
   */
  showRewarded(): Promise<{ granted: boolean; viaAd: boolean }> {
    if (!this.sdkReady || !this.appActive || useAdsStore.getState().fullScreenAdShowing || !this.rewarded?.loaded) {
      this.loadRewarded();
      return Promise.resolve({ granted: true, viaAd: false });
    }
    const ready = this.rewarded;
    return new Promise(resolve => {
      this.pendingReward = granted => resolve({ granted, viaAd: true });
      useAdsStore.setState({ fullScreenAdShowing: true });
      analytics.pauseForAd();
      ready.show().catch(() => {
        useAdsStore.setState({ fullScreenAdShowing: false });
        analytics.resumeAfterAd();
        this.pendingReward = null;
        this.disposeRewarded();
        this.loadRewarded();
        resolve({ granted: true, viaAd: false });
      });
    });
  }
}

export const adManager = new AdManager();
