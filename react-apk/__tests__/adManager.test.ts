import { AppState } from 'react-native';
import { AdManager, sanitizeAdUnitId, useAdsStore } from '../src/services/adManager';
import { DEFAULT_ADS_CONFIG, fetchAdsConfig } from '../src/api/adsApi';
import { analytics } from '../src/services/analytics';
import { BUNDLED_GAMES } from '../src/config/bundledGames';
import { readJson } from '../src/services/storage';
import { STORAGE_KEYS } from '../src/config/env';

const mockAds: any[] = [];
function mockAdFactory(unitId: string) {
  const listeners = new Map<string, Set<(error?: unknown) => void>>();
  const ad = {
    unitId, loaded: false,
    load: jest.fn(), show: jest.fn(() => Promise.resolve()),
    addAdEventListener: (event: string, handler: (error?: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => listeners.get(event)!.delete(handler);
    },
    emit: (event: string, error?: unknown) => {
      if (event === 'loaded') ad.loaded = true;
      if (event === 'closed' || event === 'error') ad.loaded = false;
      for (const handler of [...(listeners.get(event) ?? [])]) handler(error);
    },
  };
  mockAds.push(ad);
  return ad;
}
const mockCreate = jest.fn(mockAdFactory);
const mockInitialize = jest.fn(() => Promise.resolve());
jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true, default: () => ({ initialize: mockInitialize }),
  InterstitialAd: { createForAdRequest: (id: string) => mockCreate(id) },
  RewardedAd: { createForAdRequest: jest.fn() },
  AdEventType: { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'reward' },
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true, default: { addEventListener: jest.fn(() => jest.fn()) },
}));
jest.mock('../src/api/adsApi', () => {
  const actual = jest.requireActual('../src/api/adsApi');
  return { ...actual, fetchAdsConfig: jest.fn() };
});
jest.mock('../src/services/storage', () => ({ readJson: jest.fn(), writeJson: jest.fn() }));
jest.mock('../src/services/analytics', () => ({
  analytics: { pauseForAd: jest.fn(), resumeAfterAd: jest.fn(), onAdImpression: jest.fn() },
}));

const productionId = 'ca-app-pub-7756444099802746/1234567890';
const sampleId = 'ca-app-pub-3940256099942544/1033173712';
let config: typeof DEFAULT_ADS_CONFIG;
let manager: AdManager;
let changeAppState: (status: any) => void;
const first = () => mockAds[0];
const game = () => ({ ...BUNDLED_GAMES[0], ads: { enabled: true, useCustomInterval: false, intervalMinutes: 5 } });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const advance = async (ms: number) => { jest.advanceTimersByTime(ms); await flush(); };
const readyBreak = () => { first().emit('loaded'); manager.onGameOver(); };

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  jest.clearAllMocks();
  mockAds.length = 0;
  mockCreate.mockImplementation(mockAdFactory);
  config = { ...DEFAULT_ADS_CONFIG, bannerUnitId: productionId, interstitialUnitId: productionId,
    rewardedUnitId: '', cooldownSeconds: 0, defaultIntervalMinutes: 15, swipeInterval: 1000 };
  jest.mocked(fetchAdsConfig).mockImplementation(async () => config);
  jest.mocked(readJson).mockImplementation(async key => key === STORAGE_KEYS.adState
    ? { lastAdShownAt: Date.now() - 1000 } : null);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    changeAppState = callback;
    return { remove: jest.fn() };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useAdsStore.setState({ fullScreenAdShowing: false, interstitialBreakPhase: 'idle', interstitialCountdown: null,
    sdkReady: false, bannerEnabled: false, bannerUnitId: '', bannerReloadKey: 0 });
  manager = new AdManager();
  await manager.start();
  await manager.refreshConfig();
  manager.setCurrentGame(game());
});

afterEach(() => { manager.stop(); jest.clearAllTimers(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('uses the Admin unit and holds pause through 3, 2, 1, SDK close, and two full seconds', async () => {
  expect(first().unitId).toBe(productionId);
  readyBreak();
  expect(useAdsStore.getState()).toMatchObject({ fullScreenAdShowing: true, interstitialCountdown: 3 });
  expect(analytics.pauseForAd).toHaveBeenCalledTimes(1);
  await advance(1000); expect(useAdsStore.getState().interstitialCountdown).toBe(2);
  await advance(1000); expect(useAdsStore.getState().interstitialCountdown).toBe(1);
  expect(first().show).not.toHaveBeenCalled();
  await advance(999); expect(first().show).not.toHaveBeenCalled();
  await advance(1); expect(first().show).toHaveBeenCalledTimes(1);
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('showing');
  expect(analytics.resumeAfterAd).not.toHaveBeenCalled();
  first().emit('opened');
  expect(analytics.onAdImpression).toHaveBeenCalledTimes(1);
  await advance(60_000); expect(useAdsStore.getState().fullScreenAdShowing).toBe(true);
  first().emit('closed');
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('resuming');
  await advance(1999); expect(useAdsStore.getState().fullScreenAdShowing).toBe(true);
  await advance(1); expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  expect(analytics.resumeAfterAd).toHaveBeenCalledTimes(1);
});

test('a pending level/game-over trigger survives until the creative becomes loaded', () => {
  manager.onGameOver();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  first().emit('loaded');
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('countdown');
});

test('a missing creative never freezes gameplay or starts another load during play', () => {
  first().emit('error', new Error('no fill'));
  manager.setPlaying(true);
  manager.onGameOver();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  expect(analytics.pauseForAd).not.toHaveBeenCalled();
  jest.advanceTimersByTime(31_000);
  expect(mockAds).toHaveLength(1);
});

test('repeated triggers cannot schedule duplicate countdowns or shows', async () => {
  readyBreak();
  manager.onGameOver(); manager.onLevelCompleted(); manager.onNavigationEvent();
  await advance(3000);
  expect(first().show).toHaveBeenCalledTimes(1);
  expect(analytics.pauseForAd).toHaveBeenCalledTimes(1);
});

test.each(['sdk-error', 'rejection', 'throw'])('recovers pause on %s without an impression and honors retry backoff', async kind => {
  readyBreak();
  if (kind === 'rejection') first().show.mockRejectedValueOnce(new Error('show failed'));
  if (kind === 'throw') first().show.mockImplementationOnce(() => { throw new Error('show failed'); });
  await advance(3000);
  if (kind === 'sdk-error') first().emit('error', new Error('show failed'));
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('resuming');
  expect(analytics.onAdImpression).not.toHaveBeenCalled();
  await advance(2000);
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  expect(mockAds).toHaveLength(1);
  await advance(32_000);
  expect(mockAds.length).toBeGreaterThan(1);
});

test('backgrounding cancels a countdown; foreground retry starts again at three', async () => {
  readyBreak();
  await advance(1000);
  changeAppState('background');
  await advance(10_000);
  expect(first().show).not.toHaveBeenCalled();
  changeAppState('active');
  await flush();
  await manager.refreshConfig();
  expect(useAdsStore.getState().interstitialCountdown).toBe(3);
  await advance(3000); expect(first().show).toHaveBeenCalledTimes(1);
});

test('returning from the SDK activity never resumes before CLOSED; backgrounded close waits two foreground seconds', async () => {
  readyBreak(); await advance(3000); first().emit('opened');
  changeAppState('background'); changeAppState('active');
  expect(analytics.resumeAfterAd).not.toHaveBeenCalled();
  changeAppState('background'); first().emit('closed');
  await advance(10_000); expect(useAdsStore.getState().fullScreenAdShowing).toBe(true);
  changeAppState('active');
  await advance(1999); expect(useAdsStore.getState().fullScreenAdShowing).toBe(true);
  await advance(1); expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('Admin disable or unit replacement cannot remove the listeners from a showing ad', async () => {
  readyBreak(); await advance(3000); first().emit('opened');
  config = { ...config, interstitialEnabled: false, interstitialUnitId: 'ca-app-pub-7756444099802746/9876543210' };
  await manager.refreshConfig();
  first().emit('closed');
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('resuming');
  await advance(2000); expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('Admin disabling ads during countdown cancels it without showing', async () => {
  readyBreak();
  config = { ...config, interstitialEnabled: false };
  await manager.refreshConfig(); await advance(4000);
  expect(first().show).not.toHaveBeenCalled();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('per-game disabled ads and the live-style disabled configuration never start a break', async () => {
  first().emit('loaded');
  manager.setCurrentGame({ ...game(), ads: { ...game().ads, enabled: false } });
  manager.onGameOver(); expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  config = { ...config, interstitialEnabled: false, interstitialUnitId: sampleId };
  await manager.refreshConfig(); manager.setCurrentGame(game()); manager.onGameOver();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('stopping removes countdown/resume timers and stale SDK listeners', async () => {
  readyBreak(); manager.stop(); await advance(10_000);
  expect(first().show).not.toHaveBeenCalled();
  first().emit('closed');
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('idle');
});

test('unchanged config refreshes do not reload the banner', async () => {
  const key = useAdsStore.getState().bannerReloadKey;
  await manager.refreshConfig(); await manager.refreshConfig();
  expect(useAdsStore.getState().bannerReloadKey).toBe(key);
});

test('release rejects sample IDs, and there is no local production fallback', () => {
  const original = (globalThis as any).__DEV__;
  try {
    (globalThis as any).__DEV__ = false;
    expect(sanitizeAdUnitId(sampleId)).toBe('');
    expect(sanitizeAdUnitId('')).toBe('');
    expect(sanitizeAdUnitId(productionId)).toBe(productionId);
  } finally { (globalThis as any).__DEV__ = original; }
});

test.each(['create', 'load'])('synchronous SDK %s failure cannot crash or hold gameplay', async kind => {
  first().emit('error', new Error('no fill'));
  mockCreate.mockImplementationOnce(id => {
    if (kind === 'create') throw new Error('invalid ID');
    const ad = mockAdFactory(id);
    ad.load.mockImplementationOnce(() => { throw new Error('load failed'); });
    return ad;
  });
  await advance(30_000);
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  expect(analytics.pauseForAd).not.toHaveBeenCalled();
});

test('late config response after shutdown cannot update ad state', async () => {
  let resolveConfig!: (value: typeof config) => void;
  jest.mocked(fetchAdsConfig).mockImplementationOnce(() => new Promise(resolve => { resolveConfig = resolve; }));
  const pending = manager.refreshConfig();
  const key = useAdsStore.getState().bannerReloadKey;
  manager.stop();
  resolveConfig({ ...config, bannerUnitId: 'ca-app-pub-7756444099802746/2222222222' });
  await pending;
  expect(useAdsStore.getState().bannerReloadKey).toBe(key);
});

test('stopping during SDK startup does not register late listeners or start timers', async () => {
  manager.stop();
  useAdsStore.setState({ sdkReady: false });
  let resolveSdk!: () => void;
  mockInitialize.mockImplementationOnce(() => new Promise<void>(resolve => { resolveSdk = resolve; }));
  const next = new AdManager();
  const boot = next.start();
  await flush();
  jest.mocked(AppState.addEventListener).mockClear();
  next.stop(); resolveSdk(); await boot;
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(useAdsStore.getState().sdkReady).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

const swipeTo = (id: string) => manager.setCurrentGame({ ...game(), id });
const enableSwipe = async () => {
  config = { ...config, swipeAdEnabled: true, swipeInterval: 3, gameOverAdEnabled: false, levelCompleteAd: false };
  await manager.refreshConfig();
};
const disableSwipe = async () => {
  config = { ...config, swipeAdEnabled: false };
  await manager.refreshConfig();
};

test('OFF ignores all swipes and disabled events but keeps the timer', async () => {
  config = { ...config, swipeInterval: 3, gameOverAdEnabled: false, levelCompleteAd: false, defaultIntervalMinutes: 1 };
  await manager.refreshConfig();
  first().emit('loaded');
  for (let index = 0; index < 20; index++) swipeTo(`off-${index}`);
  manager.onGameOver(); manager.onLevelCompleted();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  await advance(60_000);
  expect(useAdsStore.getState().interstitialBreakPhase).toBe('countdown');
});

test('ON shows after three actual game switches, not the initial game entry', async () => {
  await enableSwipe(); first().emit('loaded');
  swipeTo('one'); swipeTo('two');
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  swipeTo('three');
  expect(useAdsStore.getState().interstitialCountdown).toBe(3);
  await advance(3000);
  expect(first().show).toHaveBeenCalledTimes(1);
});

test('OFF clears a queued swipe request before LOADED without disabling timer ads', async () => {
  await enableSwipe();
  swipeTo('one'); swipeTo('two'); swipeTo('three');
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  await disableSwipe();
  first().emit('loaded'); manager.onGameOver(); manager.onLevelCompleted();
  await advance(4000);
  expect(first().show).not.toHaveBeenCalled();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  expect(manager.getConfig().swipeInterval).toBe(3);
});

test('OFF cancels a swipe countdown without showing or holding gameplay paused', async () => {
  await enableSwipe(); first().emit('loaded');
  swipeTo('one'); swipeTo('two'); swipeTo('three');
  await advance(1000); await disableSwipe(); await advance(4000);
  expect(first().show).not.toHaveBeenCalled();
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('OFF does not cancel a timer countdown or its close-and-resume flow', async () => {
  await enableSwipe(); first().emit('loaded');
  jest.setSystemTime(Date.now() + 15 * 60_000);
  manager.onNavigationEvent();
  expect(useAdsStore.getState().interstitialCountdown).toBe(3);
  await disableSwipe(); await advance(3000);
  expect(first().show).toHaveBeenCalledTimes(1);
  first().emit('opened'); first().emit('closed');
  await advance(2000);
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('OFF after a swipe ad is showing retains SDK listeners and two-second resume', async () => {
  await enableSwipe(); first().emit('loaded');
  swipeTo('one'); swipeTo('two'); swipeTo('three');
  await advance(3000); first().emit('opened'); await disableSwipe();
  first().emit('closed');
  await advance(1999); expect(useAdsStore.getState().fullScreenAdShowing).toBe(true);
  await advance(1); expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
});

test('re-enabling starts a fresh swipe count; unchanged refreshes keep its progress', async () => {
  await enableSwipe(); first().emit('loaded');
  swipeTo('one'); swipeTo('two');
  await disableSwipe(); swipeTo('disabled'); await enableSwipe();
  swipeTo('new-one'); await manager.refreshConfig(); swipeTo('new-two');
  expect(useAdsStore.getState().fullScreenAdShowing).toBe(false);
  swipeTo('new-three');
  expect(useAdsStore.getState().interstitialCountdown).toBe(3);
});
