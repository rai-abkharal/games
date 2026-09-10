import { DEFAULT_ADS_CONFIG, normalizeAdsConfig } from '../src/api/adsApi';
import { buildAnalyticsBody } from '../src/api/analyticsApi';
import { sanitizeCatalog } from '../src/api/catalogApi';
import type { GameCatalog } from '../src/types/game';

describe('ads remote config normalisation', () => {
  test('live server shape is accepted verbatim', () => {
    const live = {
      defaultIntervalMinutes: 5,
      gaMeasurementId: 'G-SWIPEPLAY1',
      bannerEnabled: false,
      interstitialEnabled: true,
      swipeInterval: 3,
      levelCompleteAd: false,
      levelWinInterval: 1,
      gameOverAdEnabled: false,
      cooldownSeconds: 300,
      adMobAppId: 'ca-app-pub-3940256099942544~3347511713',
      bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
      interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
      rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
    };
    expect(normalizeAdsConfig(live)).toEqual(live);
  });

  test('garbage falls back to compiled defaults and clamps ranges', () => {
    const out = normalizeAdsConfig({
      swipeInterval: -4,
      defaultIntervalMinutes: 99_999,
      cooldownSeconds: -1,
      bannerUnitId: '',
      interstitialEnabled: 'yes' as unknown as boolean,
    });
    expect(out.swipeInterval).toBe(1);
    expect(out.defaultIntervalMinutes).toBe(1440);
    expect(out.cooldownSeconds).toBe(0);
    expect(out.bannerUnitId).toBe(DEFAULT_ADS_CONFIG.bannerUnitId);
    expect(out.interstitialEnabled).toBe(true);
    expect(normalizeAdsConfig(null)).toEqual(DEFAULT_ADS_CONFIG);
  });
});

describe('analytics payload (parity with GameAnalyticsManager.sendEvent)', () => {
  test('emits camelCase and snake_case twins the backend accepts', () => {
    const body = buildAnalyticsBody({
      clientId: 'cid',
      eventName: 'game_exit',
      gameId: 'tap-cannon',
      gameTitle: 'Tap Cannon',
      durationSeconds: 4,
      exitReason: 'swiped_away',
      extra: { exit_reason: 'swiped_away' },
      timestampMs: 123,
    });
    expect(body).toMatchObject({
      clientId: 'cid',
      client_id: 'cid',
      eventName: 'game_exit',
      event_name: 'game_exit',
      gameId: 'tap-cannon',
      game_id: 'tap-cannon',
      durationSeconds: 4,
      duration_seconds: 4,
      exitReason: 'swiped_away',
      isAbandoned: true,
      is_abandoned: true,
      timestampMs: 123,
    });
    expect(body.params).toMatchObject({ game_title: 'Tap Cannon', duration_seconds: 4, is_abandoned: true });
  });

  test('a long session is not abandoned and omits absent fields', () => {
    const body = buildAnalyticsBody({
      clientId: 'cid',
      eventName: 'game_over',
      gameId: 'g',
      gameTitle: 'G',
      score: 10,
      durationSeconds: 40,
      timestampMs: 1,
    });
    expect(body.isAbandoned).toBe(false);
    expect(body).not.toHaveProperty('level');
    expect(body).not.toHaveProperty('exitReason');
  });
});

describe('catalogue sanitising', () => {
  const base = 'http://162.243.197.241:3000';
  const game = (over: Record<string, unknown>) => ({
    id: 'a',
    title: 'A',
    version: '1.0.0',
    entryUrl: 'http://localhost:8080/games/a/1.0.0/index.html',
    thumbnailUrl: '/thumbnails/a.svg',
    manifestUrl: '/games/a/1.0.0/manifest.json',
    sizeBytes: 1,
    orientation: 'portrait',
    engine: 'phaser',
    feedOrder: 1,
    category: 'Arcade',
    description: '',
    ...over,
  });

  test('drops unplayable/hidden/duplicate entries and sorts by feedOrder', () => {
    const catalog = {
      version: 1,
      games: [
        game({ id: 'b', feedOrder: 2 }),
        game({ id: 'a', feedOrder: 1 }),
        game({ id: 'a', feedOrder: 9 }), // duplicate id
        game({ id: 'c', status: 'archived' }),
        game({ id: 'd', entryUrl: '' }),
        { id: '', title: 'broken' },
      ],
    } as unknown as GameCatalog;
    const out = sanitizeCatalog(catalog, base);
    expect(out.map(g => g.id)).toEqual(['a', 'b']);
    expect(out[0].entryUrl).toBe(`${base}/games/a/1.0.0/index.html`);
  });
});
