import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import mobileAds, {
  AdEventType,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { create } from 'zustand';
import { DEFAULT_ADS_CONFIG, fetchAdsConfig, normalizeAdsConfig } from '../api/adsApi';
import { isTestAdUnitId, NETWORK, STORAGE_KEYS } from '../config/env';
import type { AdsRemoteConfig, GameItem } from '../types/game';
import { isAdDue, restoredAnchor } from './adTimingPolicy';
import { analytics } from './analytics';
import { readJson, writeJson } from './storage';

/**
 * Resolves an Ad Unit ID directly from the Admin Panel.
 * In release builds, test ad unit IDs are never allowed under any circumstances.
 */
export function sanitizeAdUnitId(unitId: string | undefined | null): string {
  const clean = (unitId || '').trim();
  if (!clean) return '';
  // In release builds, test ads must never be shown under any circumstances.
  if (!__DEV__ && isTestAdUnitId(clean)) {
    return '';
  }
  return clean;
}

/** UI-facing slice; components subscribe to this, the manager owns the rest. */
interface AdsUiState {
  bannerEnabled: boolean;
  bannerUnitId: string;
  bannerReloadKey: number;
  sdkReady: boolean;
  fullScreenAdShowing: boolean;
  interstitialBreakPhase: 'idle' | 'countdown' | 'showing' | 'resuming';
  interstitialCountdown: number | null;
}

export const useAdsStore = create<AdsUiState>(() => ({
  bannerEnabled: false,
  bannerUnitId: '',
  bannerReloadKey: 0,
  sdkReady: false,
  fullScreenAdShowing: false,
  interstitialBreakPhase: 'idle',
  interstitialCountdown: null,
}));

type InterstitialTrigger = 'timer' | 'swipe' | 'event';

interface InterstitialBreak {
  ad: InterstitialAd;
  game: GameItem;
  trigger: InterstitialTrigger;
  phase: 'countdown' | 'showing' | 'resuming';
  countdown: number;
  opened: boolean;
}

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
 * Unit ids come from Admin in both builds. Release rejects Google's sample
 * units; debug testing requires test units or a registered AdMob test device.
 */
export class AdManager {
  private config: AdsRemoteConfig = DEFAULT_ADS_CONFIG;
  private interstitial: InterstitialAd | null = null;
  private interstitialUnsubs: Array<() => void> = [];
  private interstitialLoading = false;
  private interstitialUnitId: string = '';
  private rewarded: RewardedAd | null = null;
  private rewardedUnsubs: Array<() => void> = [];
  private rewardedUnitId: string = '';
  private rewardedLoading = false;
  private pendingReward: ((granted: boolean) => void) | null = null;

  private lastAdShownAt = Date.now();
  private nextLoadAttemptAt = 0;
  private swipeCount = 0;
  private levelWinCount = 0;
  private adDueTrigger: InterstitialTrigger | null = null;
  private get adDue(): boolean { return this.adDueTrigger !== null; }
  private appActive = true;
  private currentGame: GameItem | null = null;
  private lastConfigFetchAt = 0;
  private configInflight: Promise<void> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private appStateSub: NativeEventSubscription | null = null;
  private netInfoSub: NetInfoSubscription | null = null;
  private wasOffline = false;
  private lastNetworkRestoreAt = 0;
  private started = false;
  private sdkReady = false;
  /** Set by the feed: a game currently owns the WebView renderer. */
  private playing = false;
  private interstitialDeferred = false;
  private rewardedDeferred = false;
  private interstitialBreak: InterstitialBreak | null = null;
  private breakTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycle = 0;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const lifecycle = ++this.lifecycle;

    const [saved, savedConfig] = await Promise.all([
      readJson<PersistedAdState>(STORAGE_KEYS.adState),
      readJson<Partial<AdsRemoteConfig>>(STORAGE_KEYS.adsConfig),
    ]);
    if (!this.started || lifecycle !== this.lifecycle) return;
    const now = Date.now();
    this.lastAdShownAt = restoredAnchor(saved?.lastAdShownAt ?? 0, now);
    if (savedConfig) this.applyConfig(normalizeAdsConfig(savedConfig));
    this.persistState();

    try {
      await mobileAds().initialize();
      if (!this.started || lifecycle !== this.lifecycle) return;
      this.sdkReady = true;
      useAdsStore.setState(s => ({ sdkReady: true, bannerReloadKey: s.bannerReloadKey + 1 }));
    } catch {
      if (!this.started || lifecycle !== this.lifecycle) return;
      // The SDK failing to initialise must never block gameplay; we simply
      // won't show ads this session.
      this.sdkReady = false;
      useAdsStore.setState({ sdkReady: false });
    }

    this.appStateSub = AppState.addEventListener('change', this.onAppState);
    this.appActive = AppState.currentState === 'active';

    this.netInfoSub = NetInfo.addEventListener(state => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      if (isOnline && this.wasOffline) {
        this.onNetworkRestored();
      }
      this.wasOffline = isOffline;
    });

    void this.refreshConfig();
    this.loadInterstitial();
    this.loadRewarded();
    this.startTicker();
  }

  stop(): void {
    this.started = false;
    this.lifecycle++;
    this.configInflight = null;
    this.stopTicker();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.netInfoSub?.();
    this.netInfoSub = null;
    this.cancelBreak();
    this.disposeInterstitial();
    this.disposeRewarded();
    this.currentGame = null;
    this.playing = false;
    this.adDueTrigger = null;
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  private onAppState = (status: AppStateStatus) => {
    const active = status === 'active';
    if (active === this.appActive) return;
    this.appActive = active;
    if (active) {
      if (!useAdsStore.getState().fullScreenAdShowing) analytics.resumeAfterAd();
      if (this.interstitialBreak?.phase === 'resuming') this.scheduleResume(this.interstitialBreak);
      void this.refreshConfig();
      if (!this.interstitial?.loaded) this.loadInterstitial();
      if (!this.rewarded) this.loadRewarded();
      this.startTicker();
    } else {
      // Never let a countdown show an ad behind another app. Retry a fresh
      // countdown when foregrounded; a real SDK ad keeps its close listeners.
      if (this.interstitialBreak?.phase === 'countdown') {
        this.adDueTrigger = this.interstitialBreak.trigger;
        this.cancelBreak();
      } else if (this.interstitialBreak?.phase === 'resuming') {
        this.clearBreakTimer();
      }
      if (useAdsStore.getState().fullScreenAdShowing) analytics.pauseForAd();
      this.stopTicker();
    }
  };

  /**
   * Called immediately when internet connection is restored while the app is running.
   * Cancels any failure back-off timer, re-fetches remote config, and triggers
   * immediate ad requests (including remounting any previously failed banner).
   */
  private onNetworkRestored(): void {
    const now = Date.now();
    if (now - this.lastNetworkRestoreAt < 2000) return;
    this.lastNetworkRestoreAt = now;
    this.wasOffline = false;
    this.nextLoadAttemptAt = 0;
    void this.refreshConfig();
    this.loadInterstitial();
    if (!this.rewarded) this.loadRewarded();
    useAdsStore.setState(s => ({ bannerReloadKey: s.bannerReloadKey + 1 }));
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      if (!this.appActive || useAdsStore.getState().fullScreenAdShowing) return;
      if (Date.now() - this.lastConfigFetchAt >= NETWORK.adsConfigRefreshIntervalMs) {
        void this.refreshConfig();
      }
      this.loadInterstitial();
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
    const lifecycle = this.lifecycle;
    this.lastConfigFetchAt = Date.now();
    this.configInflight = (async () => {
      try {
        const config = await fetchAdsConfig();
        if (!this.started || lifecycle !== this.lifecycle) return;
        writeJson(STORAGE_KEYS.adsConfig, config, 0);
        this.applyConfig(config);
        this.loadInterstitial();
        if (!this.rewarded) this.loadRewarded();
        this.check(false);
      } catch {
        // Network failed (offline); mark so we react the instant connection returns
        this.wasOffline = true;
      } finally {
        if (lifecycle === this.lifecycle) this.configInflight = null;
      }
    })();
    return this.configInflight;
  }

  private applyConfig(config: AdsRemoteConfig) {
    const previousInterstitial = this.interstitialUnitId;
    const previousRewarded = this.rewardedUnitId;
    const previousSwipeEnabled = this.config.swipeAdEnabled;
    this.config = config;

    if (!config.swipeAdEnabled || !previousSwipeEnabled) this.swipeCount = 0;
    if (!config.swipeAdEnabled) {
      if (this.adDueTrigger === 'swipe') this.adDueTrigger = null;
      if (this.interstitialBreak?.phase === 'countdown' && this.interstitialBreak.trigger === 'swipe') this.cancelBreak();
    }

    // Directly use production IDs from the Admin Panel.
    // In release builds, test ads are never shown under any circumstances.
    const bannerUnitId = sanitizeAdUnitId(config.bannerUnitId);
    this.interstitialUnitId = sanitizeAdUnitId(config.interstitialUnitId);
    this.rewardedUnitId = sanitizeAdUnitId(config.rewardedUnitId);

    if (this.interstitialBreak?.phase === 'countdown' &&
      (!config.interstitialEnabled || previousInterstitial !== this.interstitialUnitId)) this.cancelBreak();
    // A showing ad must keep its CLOSED/ERROR listeners even if Admin changes
    // its unit or disables interstitials while it is visible.
    if (previousInterstitial !== this.interstitialUnitId && this.interstitialBreak?.phase !== 'showing') this.disposeInterstitial();
    if (previousRewarded !== this.rewardedUnitId) this.disposeRewarded();

    const bannerEnabled = Boolean(config.bannerEnabled && bannerUnitId);
    useAdsStore.setState(s => ({
      bannerEnabled,
      bannerUnitId,
      bannerReloadKey: s.bannerReloadKey + (s.bannerUnitId !== bannerUnitId || s.bannerEnabled !== bannerEnabled ? 1 : 0),
    }));
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
    const previousGame = this.currentGame;
    const changed = game?.id !== this.currentGame?.id;
    this.currentGame = game;
    if (this.interstitialBreak?.phase === 'countdown' &&
      (!game || game.id !== this.interstitialBreak.game.id || game.ads?.enabled === false)) this.cancelBreak();
    if (game && changed) {
      // Opening the first game is not a swipe.
      if (previousGame && this.config.swipeAdEnabled) this.swipeCount += 1;
      this.check(false);
    }
  }

  onGameOver(): void {
    if (this.config.gameOverAdEnabled || this.adDue) this.check(this.config.gameOverAdEnabled);
  }

  onLevelCompleted(): void {
    this.levelWinCount += 1;
    const thresholdMet = this.config.levelCompleteAd && this.levelWinCount >= this.config.levelWinInterval;
    if (thresholdMet || this.adDue) {
      this.check(thresholdMet);
    }
  }

  /** Native shows an interstitial (if due) when Settings is opened. */
  onNavigationEvent(): void {
    this.check(false);
  }

  /**
   * Whether a game currently owns the WebView renderer. Loading a creative
   * builds another WebView inside that same renderer process, which costs the
   * running game frames, so preloads are held until play ends — a game over, a
   * level end, Settings, a full-screen ad, or the app going to the background.
   * Due decisions keep the Admin schedule; a ready creative is presented only
   * after the exclusive three-second ad-break countdown.
   */
  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    if (playing) return;
    // The flags are cleared by the loaders themselves, so a load that is still
    // blocked for another reason (an ad on screen, a failure back-off) stays
    // remembered instead of being silently dropped here.
    if (this.interstitialDeferred) this.loadInterstitial();
    if (this.rewardedDeferred) this.loadRewarded();
  }

  /**
   * A ready creative begins an exclusive countdown/pause flow. A missing
   * creative is only marked due; network fill never freezes the player's game.
   */
  private check(forceIfDue: boolean): void {
    if (!this.sdkReady || !this.config.interstitialEnabled || !this.interstitialUnitId || !this.appActive) return;
    if (useAdsStore.getState().fullScreenAdShowing) return;
    const game = this.currentGame;
    if (!game) return;
    if (game.ads?.enabled === false) return;

    const minutes = game.ads?.useCustomInterval ? game.ads.intervalMinutes : this.config.defaultIntervalMinutes;
    const elapsed = Date.now() - this.lastAdShownAt;
    const timerDue = isAdDue(elapsed, minutes, this.config.cooldownSeconds, false);
    const swipeDue = this.config.swipeAdEnabled && this.config.swipeInterval > 0 && this.swipeCount >= this.config.swipeInterval;
    if (!isAdDue(elapsed, minutes, this.config.cooldownSeconds, forceIfDue || swipeDue || this.adDue)) return;
    const trigger: InterstitialTrigger = timerDue ? 'timer' : forceIfDue ? 'event' : (this.adDueTrigger ?? 'swipe');

    if (this.interstitial?.loaded) {
      this.beginBreak(this.interstitial, game, trigger);
    } else {
      this.adDueTrigger = trigger;
      this.loadInterstitial();
    }
  }

  private recordAdShown() {
    this.lastAdShownAt = Date.now();
    this.swipeCount = 0;
    this.levelWinCount = 0;
    this.adDueTrigger = null;
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

  private clearBreakTimer(): void {
    if (this.breakTimer !== null) clearTimeout(this.breakTimer);
    this.breakTimer = null;
  }

  private cancelBreak(): void {
    if (!this.interstitialBreak) return;
    this.clearBreakTimer();
    this.interstitialBreak = null;
    useAdsStore.setState({ fullScreenAdShowing: false, interstitialBreakPhase: 'idle', interstitialCountdown: null });
    analytics.resumeAfterAd();
  }

  private beginBreak(ad: InterstitialAd, game: GameItem, trigger: InterstitialTrigger): void {
    const flow: InterstitialBreak = { ad, game, trigger, phase: 'countdown', countdown: 3, opened: false };
    this.interstitialBreak = flow;
    analytics.pauseForAd();
    // The feed's synchronous subscriber freezes its existing WebViews here,
    // before either the overlay render or the first countdown timer.
    useAdsStore.setState({ fullScreenAdShowing: true, interstitialBreakPhase: 'countdown', interstitialCountdown: 3 });
    this.scheduleCountdown(flow);
  }

  private scheduleCountdown(flow: InterstitialBreak): void {
    this.clearBreakTimer();
    this.breakTimer = setTimeout(() => {
      this.breakTimer = null;
      if (this.interstitialBreak !== flow || flow.phase !== 'countdown') return;
      if (!this.appActive || !this.config.interstitialEnabled || this.currentGame?.id !== flow.game.id ||
        this.currentGame.ads?.enabled === false || this.interstitial !== flow.ad || !flow.ad.loaded) {
        this.cancelBreak();
        return;
      }
      flow.countdown--;
      if (flow.countdown > 0) {
        useAdsStore.setState({ interstitialCountdown: flow.countdown });
        this.scheduleCountdown(flow);
      } else {
        flow.phase = 'showing';
        useAdsStore.setState({ interstitialBreakPhase: 'showing', interstitialCountdown: null });
        try {
          // show() resolving means presentation was requested, NOT that the ad
          // closed. Only SDK CLOSED/ERROR can start the two-second return delay.
          void flow.ad.show().catch(error => this.finishBreak(flow, error));
        } catch (error) { this.finishBreak(flow, error); }
      }
    }, 1000);
  }

  private finishBreak(flow: InterstitialBreak, error?: unknown): void {
    if (this.interstitialBreak !== flow || flow.phase === 'resuming') return;
    this.clearBreakTimer();
    if (error !== undefined) {
      console.warn('[Ads] Interstitial failed:', error);
      this.adDueTrigger = flow.trigger === 'swipe' && !this.config.swipeAdEnabled ? null : flow.trigger;
      this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
    }
    flow.phase = 'resuming';
    this.disposeInterstitial();
    useAdsStore.setState({ interstitialBreakPhase: 'resuming', interstitialCountdown: null });
    this.scheduleResume(flow);
    // A replacement creative may preload while gameplay is still frozen.
    this.loadInterstitial();
  }

  private scheduleResume(flow: InterstitialBreak): void {
    this.clearBreakTimer();
    if (!this.appActive) return;
    this.breakTimer = setTimeout(() => {
      this.breakTimer = null;
      if (this.interstitialBreak === flow && flow.phase === 'resuming' && this.appActive) this.cancelBreak();
    }, 2000);
  }

  private loadInterstitial(): void {
    if (
      !this.sdkReady ||
      !this.config.interstitialEnabled ||
      !this.interstitialUnitId ||
      this.interstitialLoading ||
      this.interstitial?.loaded ||
      (useAdsStore.getState().fullScreenAdShowing && this.interstitialBreak?.phase !== 'resuming') ||
      Date.now() < this.nextLoadAttemptAt
    ) {
      return;
    }
    if (this.playing) {
      // Remembered rather than dropped: `adDue` stays set, so the ad still
      // shows at the first opportunity once play ends.
      this.interstitialDeferred = true;
      return;
    }
    this.interstitialDeferred = false;
    this.disposeInterstitial();
    const unitId = this.interstitialUnitId;
    let ad: InterstitialAd;
    try { ad = InterstitialAd.createForAdRequest(unitId); }
    catch (error) {
      console.warn('[Ads] Invalid interstitial request:', error);
      this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
      return;
    }
    this.interstitial = ad;
    this.interstitialLoading = true;

    this.interstitialUnsubs = [
      ad.addAdEventListener(AdEventType.LOADED, () => {
        if (this.interstitial !== ad) return;
        this.interstitialLoading = false;
        if (unitId !== this.interstitialUnitId) {
          this.disposeInterstitial();
          this.loadInterstitial();
          return;
        }
        if (this.adDue && this.currentGame?.ads?.enabled !== false) this.check(false);
      }),
      ad.addAdEventListener(AdEventType.ERROR, error => {
        if (this.interstitial !== ad) return;
        if (this.interstitialBreak?.ad === ad) {
          this.finishBreak(this.interstitialBreak, error ?? new Error('SDK interstitial error'));
          return;
        }
        console.warn('[Ads] Interstitial load failed:', error);
        this.interstitialLoading = false;
        this.disposeInterstitial();
        this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
      }),
      ad.addAdEventListener(AdEventType.OPENED, () => {
        const flow = this.interstitialBreak;
        if (!flow || flow.ad !== ad || flow.phase !== 'showing' || flow.opened) return;
        flow.opened = true;
        this.recordAdShown();
        analytics.onAdImpression(flow.game.id, flow.game.title);
      }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        const flow = this.interstitialBreak;
        if (flow?.ad === ad && flow.phase === 'showing') this.finishBreak(flow);
      }),
    ];
    try { ad.load(); }
    catch (error) {
      console.warn('[Ads] Interstitial load failed:', error);
      this.disposeInterstitial();
      this.nextLoadAttemptAt = Date.now() + RETRY_BACKOFF_MS;
    }
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
    if (!this.sdkReady || !this.rewardedUnitId || this.rewardedLoading || this.rewarded?.loaded) return;
    if (this.playing) {
      this.rewardedDeferred = true;
      return;
    }
    this.rewardedDeferred = false;
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
