import { analytics, resolveUniversalGameName } from '../src/services/analytics';
import { loggedEvents, userProperties } from '../__mocks__/firebaseAnalytics';
import { useCatalogStore } from '../src/store/catalogStore';

describe('Firebase Analytics & Universal Game Identity', () => {
  beforeEach(() => {
    loggedEvents.length = 0;
    // Populate catalog with test games simulating Admin Panel data
    useCatalogStore.setState({
      games: [
        {
          id: 'snake-classic',
          title: 'Snake Classic Deluxe',
          version: '1.0.0',
          entryUrl: 'http://example.com/snake',
          thumbnailUrl: 'http://example.com/snake.png',
          sizeBytes: 1024,
          orientation: 'portrait',
          engine: 'canvas',
          manifestUrl: '',
          feedOrder: 1,
          category: 'Arcade',
          description: 'Endless classic snake game',
        },
        {
          id: 'custom-game-123',
          title: 'Quantum Portal Jumper',
          version: '1.0.0',
          entryUrl: 'http://example.com/jumper',
          thumbnailUrl: 'http://example.com/jumper.png',
          sizeBytes: 2048,
          orientation: 'portrait',
          engine: 'phaser',
          manifestUrl: '',
          feedOrder: 2,
          category: 'Puzzle',
          description: 'Admin created portal game',
        },
      ],
      status: 'ready',
    });
  });

  test('resolveUniversalGameName dynamically retrieves title from catalog', () => {
    expect(resolveUniversalGameName('snake-classic')).toBe('Snake Classic Deluxe');
    expect(resolveUniversalGameName('custom-game-123')).toBe('Quantum Portal Jumper');
    expect(resolveUniversalGameName('unknown-game', 'Fallback Name')).toBe('Fallback Name');
  });

  test('resolveUniversalGameName reflects Admin Panel edits immediately', () => {
    // Admin renames the game in the Admin Panel
    useCatalogStore.setState({
      games: [
        {
          id: 'snake-classic',
          title: 'Super Retro Snake 99', // Updated name from Admin Panel
          version: '1.1.0',
          entryUrl: 'http://example.com/snake',
          thumbnailUrl: 'http://example.com/snake.png',
          sizeBytes: 1024,
          orientation: 'portrait',
          engine: 'canvas',
          manifestUrl: '',
          feedOrder: 1,
          category: 'Arcade',
          description: 'Endless classic snake game',
        },
      ],
    });

    expect(resolveUniversalGameName('snake-classic')).toBe('Super Retro Snake 99');
  });

  test('logs game_start and game_select with dynamic universal name', async () => {
    analytics.onGameSelect('snake-classic', undefined, 'Arcade');
    await analytics.onGameStart('snake-classic', undefined, 'Arcade');

    const selectEvt = loggedEvents.find(e => e.name === 'game_select');
    expect(selectEvt).toBeDefined();
    expect(selectEvt?.params?.item_id).toBe('snake-classic');
    expect(selectEvt?.params?.item_name).toBe('Snake Classic Deluxe');

    const startEvt = loggedEvents.find(e => e.name === 'game_start');
    expect(startEvt).toBeDefined();
    expect(startEvt?.params?.game_id).toBe('snake-classic');
    expect(startEvt?.params?.game_name).toBe('Snake Classic Deluxe');
    expect(startEvt?.params?.play_count).toBeGreaterThanOrEqual(1);
    expect(startEvt?.params?.attempt_number).toBeGreaterThanOrEqual(1);
  });

  test('logs game_complete and level_end with result="passed"', async () => {
    await analytics.onGameStart('snake-classic');
    analytics.onGameCompleted('snake-classic', undefined, 1250, 3);

    const completeEvt = loggedEvents.find(e => e.name === 'game_complete');
    expect(completeEvt).toBeDefined();
    expect(completeEvt?.params?.game_name).toBe('Snake Classic Deluxe');
    expect(completeEvt?.params?.score).toBe(1250);
    expect(completeEvt?.params?.level).toBe(3);
    expect(completeEvt?.params?.result).toBe('passed');

    const levelEndEvt = loggedEvents.find(e => e.name === 'level_end');
    expect(levelEndEvt).toBeDefined();
    expect(levelEndEvt?.params?.result).toBe('passed');
    expect(levelEndEvt?.params?.success).toBe(1);
  });

  test('logs game_fail and level_end with result="failed"', async () => {
    await analytics.onGameStart('snake-classic');
    analytics.onGameOver('snake-classic', undefined, 300, 'collision', 2);

    const failEvt = loggedEvents.find(e => e.name === 'game_fail');
    expect(failEvt).toBeDefined();
    expect(failEvt?.params?.game_name).toBe('Snake Classic Deluxe');
    expect(failEvt?.params?.score).toBe(300);
    expect(failEvt?.params?.result).toBe('failed');

    const levelEndEvt = loggedEvents.find(e => e.name === 'level_end');
    expect(levelEndEvt).toBeDefined();
    expect(levelEndEvt?.params?.result).toBe('failed');
    expect(levelEndEvt?.params?.success).toBe(0);
  });

  test('logs game_exit with accurate duration and exit_reason', async () => {
    await analytics.onGameStart('custom-game-123');
    analytics.onGameExit('custom-game-123', undefined, 'swiped_away', 50, false);

    const exitEvt = loggedEvents.find(e => e.name === 'game_exit' && e.params?.game_id === 'custom-game-123');
    expect(exitEvt).toBeDefined();
    expect(exitEvt?.params?.game_id).toBe('custom-game-123');
    expect(exitEvt?.params?.game_name).toBe('Quantum Portal Jumper');
    expect(exitEvt?.params?.exit_reason).toBe('swiped_away');
    // GA4 has no boolean type: a JS boolean reaches a report as an unusable
    // string, so flags are normalised to 1/0 on the way out.
    expect(exitEvt?.params?.abandoned).toBe(1);
  });

  test('every game event carries the identity a report groups by', async () => {
    await analytics.onGameStart('snake-classic', undefined, 'Arcade');
    const startEvt = loggedEvents.find(e => e.name === 'game_start');
    expect(startEvt?.params?.game_id).toBe('snake-classic');
    expect(startEvt?.params?.game_name).toBe('Snake Classic Deluxe');
    expect(startEvt?.params?.item_id).toBe('snake-classic');
    expect(startEvt?.params?.item_name).toBe('Snake Classic Deluxe');
    expect(startEvt?.params?.page_title).toBe('Snake Classic Deluxe');
    expect(startEvt?.params?.page_location).toBe('http://example.com/snake');
    expect(startEvt?.params?.game_version).toBe('1.0.0');
    expect(startEvt?.params?.session_id).toEqual(expect.any(String));
    expect(startEvt?.params?.event_ts).toEqual(expect.any(Number));
  });

  test('onGameScreenView logs screen_view and page_view with game title and web page location', () => {
    analytics.onGameScreenView('snake-classic', undefined, 'http://example.com/snake');
    const screenEvt = loggedEvents.find(e => e.name === 'screen_view');
    expect(screenEvt).toBeDefined();
    expect(screenEvt?.params?.screen_name).toBe('Snake Classic Deluxe');
    expect(screenEvt?.params?.screen_class).toBe('GameWebView');

    const pageEvt = loggedEvents.find(e => e.name === 'page_view');
    expect(pageEvt).toBeDefined();
    expect(pageEvt?.params?.page_title).toBe('Snake Classic Deluxe');
    expect(pageEvt?.params?.page_location).toBe('http://example.com/snake');
  });

  test('game_impression is counted once per game per session', () => {
    analytics.onGameImpression('snake-classic', undefined, 'Arcade', 3);
    analytics.onGameImpression('snake-classic', undefined, 'Arcade', 3);
    expect(loggedEvents.filter(e => e.name === 'game_impression')).toHaveLength(1);
    const evt = loggedEvents.find(e => e.name === 'game_impression');
    expect(evt?.params?.game_name).toBe('Snake Classic Deluxe');
    expect(evt?.params?.feed_position).toBe(3);
  });

  test('game_load carries per-stage timings and never reports one load twice', () => {
    const detail = {
      outcome: 'ready' as const,
      source: 'local' as const,
      loadKey: 'snake-classic:build-1:0',
      webviewMs: 40,
      htmlMs: 120,
      engineMs: 900,
      firstFrameMs: 950,
      totalMs: 1100,
    };
    analytics.onGameLoad('snake-classic', detail);
    analytics.onGameLoad('snake-classic', detail);

    const loads = loggedEvents.filter(e => e.name === 'game_load');
    expect(loads).toHaveLength(1);
    expect(loads[0].params?.game_name).toBe('Snake Classic Deluxe');
    expect(loads[0].params?.source).toBe('local');
    expect(loads[0].params?.engine_ms).toBe(900);
    expect(loads[0].params?.total_ms).toBe(1100);
  });

  test('game_download reports the finished transfer, not its progress', () => {
    analytics.onGameDownload('snake-classic', {
      outcome: 'complete',
      bytes: 4_500_000,
      durationMs: 9_000,
    });
    const evt = loggedEvents.find(e => e.name === 'game_download');
    expect(evt?.params?.game_id).toBe('snake-classic');
    expect(evt?.params?.outcome).toBe('complete');
    expect(evt?.params?.bytes).toBe(4_500_000);
    expect(evt?.params?.kbps).toBe(500);
  });

  test('a parameter GA4 would silently drop is normalised instead', () => {
    analytics.onGameAction('snake-classic', undefined, 'note', 'x'.repeat(250));
    const evt = loggedEvents.find(e => e.name === 'game_action' && e.params?.action_name === 'note');
    expect(String(evt?.params?.action_value)).toHaveLength(100);
  });

  test('logs game_action and screen_view', () => {
    analytics.onGameAction('snake-classic', undefined, 'earn_coins', 50);
    analytics.onScreenView('Settings', 'SettingsScreen');

    const actionEvt = loggedEvents.find(e => e.name === 'game_action');
    expect(actionEvt?.params?.action_name).toBe('earn_coins');
    expect(actionEvt?.params?.action_value).toBe('50');

    const screenEvt = loggedEvents.find(e => e.name === 'screen_view');
    expect(screenEvt?.params?.screen_name).toBe('Settings');
  });

  describe('Per-Game Distinction & Reporting: Snake vs Car Racing', () => {
    const CORE_EVENT_NAMES = new Set([
      'game_start',
      'game_exit',
      'game_load',
      'game_impression',
      'game_select',
      'game_complete',
      'game_fail',
      'game_action',
      'level_start',
      'level_end',
      'screen_view',
      'page_view',
      'ad_impression',
      'game_snake',
      'game_car_racing',
    ]);

    beforeEach(() => {
      loggedEvents.length = 0;
      useCatalogStore.setState({
        games: [
          {
            id: 'snake',
            title: 'Snake',
            version: '1.0.0',
            entryUrl: 'http://example.com/games/snake/index.html',
            thumbnailUrl: 'http://example.com/games/snake/thumb.png',
            sizeBytes: 1024 * 500,
            orientation: 'portrait',
            engine: 'canvas',
            manifestUrl: '',
            feedOrder: 1,
            category: 'Arcade',
            description: 'Classic arcade snake game',
          },
          {
            id: 'car-racing',
            title: 'Car Racing',
            version: '2.1.0',
            entryUrl: 'http://example.com/games/car-racing/index.html',
            thumbnailUrl: 'http://example.com/games/car-racing/thumb.png',
            sizeBytes: 1024 * 1200,
            orientation: 'portrait',
            engine: 'phaser',
            manifestUrl: '',
            feedOrder: 2,
            category: 'Racing',
            description: 'High-speed 2D racing challenge',
          },
        ],
        status: 'ready',
      });
    });

    test('maintains small static event taxonomy with NO dynamic event names', async () => {
      // Simulate user playing Snake
      analytics.onGameScreenView('snake', undefined, 'http://example.com/games/snake/index.html');
      analytics.onGameImpression('snake', undefined, 'Arcade', 1);
      await analytics.onGameStart('snake', undefined, 'Arcade');
      analytics.onGameLoad('snake', {
        outcome: 'ready',
        source: 'local',
        loadKey: 'snake:load:1',
        totalMs: 650,
        firstFrameMs: 420,
      });
      analytics.onGameExit('snake', undefined, 'swiped_away', 150, false, 120);

      // Simulate user playing Car Racing
      analytics.onGameScreenView('car-racing', undefined, 'http://example.com/games/car-racing/index.html');
      analytics.onGameImpression('car-racing', undefined, 'Racing', 2);
      await analytics.onGameStart('car-racing', undefined, 'Racing');
      analytics.onGameLoad('car-racing', {
        outcome: 'ready',
        source: 'network',
        loadKey: 'car:load:1',
        downloadMs: 800,
        totalMs: 1450,
        firstFrameMs: 890,
      });
      analytics.onGameCompleted('car-racing', undefined, 280, 1, 45);
      analytics.onGameExit('car-racing', undefined, 'user_exit', 280, true, 45);

      // Verify all emitted events belong to the small, clean taxonomy (0 dynamic names)
      for (const evt of loggedEvents) {
        expect(CORE_EVENT_NAMES.has(evt.name)).toBe(true);
        expect(evt.name.startsWith('snake_')).toBe(false);
        expect(evt.name.startsWith('car_racing_')).toBe(false);
        expect(evt.name.startsWith('car-racing_')).toBe(false);
      }
    });

    test('allows filtering and reporting Snake and Car Racing separately', async () => {
      // 1. Snake Session
      analytics.onGameScreenView('snake', undefined, 'http://example.com/games/snake/index.html');
      analytics.onGameImpression('snake');
      await analytics.onGameStart('snake');
      analytics.onGameExit('snake', undefined, 'swiped_away', 120, false, 95);

      // 2. Car Racing Session
      analytics.onGameScreenView('car-racing', undefined, 'http://example.com/games/car-racing/index.html');
      analytics.onGameImpression('car-racing');
      await analytics.onGameStart('car-racing');
      analytics.onGameExit('car-racing', undefined, 'navigated', 340, true, 180);

      // A. Filter by game_name for GA4 Custom Dimension reporting
      const snakeEvents = loggedEvents.filter(e => e.params?.game_name === 'Snake');
      const carEvents = loggedEvents.filter(e => e.params?.game_name === 'Car Racing');

      expect(snakeEvents.length).toBeGreaterThan(0);
      expect(carEvents.length).toBeGreaterThan(0);

      // B. Verify Snake specific metrics
      const snakeStart = snakeEvents.find(e => e.name === 'game_start');
      const snakeExit = snakeEvents.find(e => e.name === 'game_exit');
      expect(snakeStart?.params?.game_id).toBe('snake');
      expect(snakeStart?.params?.game_name).toBe('Snake');
      expect(snakeStart?.params?.category).toBe('Arcade');
      expect(snakeExit?.params?.duration_seconds).toBe(95);

      // C. Verify Car Racing specific metrics
      const carStart = carEvents.find(e => e.name === 'game_start');
      const carExit = carEvents.find(e => e.name === 'game_exit');
      expect(carStart?.params?.game_id).toBe('car-racing');
      expect(carStart?.params?.game_name).toBe('Car Racing');
      expect(carStart?.params?.category).toBe('Racing');
      expect(carExit?.params?.duration_seconds).toBe(180);

      // D. Verify GA4 "Pages and screens" screen names
      const screenViews = loggedEvents.filter(e => e.name === 'screen_view');
      const snakeScreen = screenViews.find(e => e.params?.screen_name === 'Snake');
      const carScreen = screenViews.find(e => e.params?.screen_name === 'Car Racing');
      expect(snakeScreen).toBeDefined();
      expect(carScreen).toBeDefined();

      // E. Verify user property updates
      expect(userProperties['last_played_game']).toBe('Car Racing');
      expect(userProperties['last_played_game_id']).toBe('car-racing');
    });

    test('differentiates technical performance between Snake (cached) and Car Racing (network)', () => {
      // Snake loaded from local cache
      analytics.onGameLoad('snake', {
        outcome: 'ready',
        source: 'local',
        loadKey: 'snake:perf:1',
        webviewMs: 30,
        htmlMs: 80,
        engineMs: 500,
        firstFrameMs: 420,
        totalMs: 650,
      });

      // Car Racing loaded over network
      analytics.onGameLoad('car-racing', {
        outcome: 'ready',
        source: 'network',
        loadKey: 'car-racing:load:1',
        downloadMs: 800,
        webviewMs: 50,
        htmlMs: 150,
        engineMs: 650,
        firstFrameMs: 890,
        totalMs: 1450,
      });

      const loads = loggedEvents.filter(e => e.name === 'game_load');
      expect(loads).toHaveLength(2);

      const snakeLoad = loads.find(l => l.params?.game_name === 'Snake');
      expect(snakeLoad?.params?.source).toBe('local');
      expect(snakeLoad?.params?.total_ms).toBe(650);
      expect(snakeLoad?.params?.first_frame_ms).toBe(420);
      expect(snakeLoad?.params?.outcome).toBe('ready');

      const carLoad = loads.find(l => l.params?.game_name === 'Car Racing');
      expect(carLoad?.params?.source).toBe('network');
      expect(carLoad?.params?.download_ms).toBe(800);
      expect(carLoad?.params?.total_ms).toBe(1450);
      expect(carLoad?.params?.first_frame_ms).toBe(890);
      expect(carLoad?.params?.outcome).toBe('ready');
    });

    test('emits primary game-named event so each game appears directly in Firebase Events table', async () => {
      await analytics.onGameStart('snake', undefined, 'Arcade');
      await analytics.onGameStart('car-racing', undefined, 'Racing');

      // Direct game event names in Firebase Console -> Events
      const snakeEvent = loggedEvents.find(e => e.name === 'game_snake');
      const carEvent = loggedEvents.find(e => e.name === 'game_car_racing');

      expect(snakeEvent).toBeDefined();
      expect(snakeEvent?.params?.game_name).toBe('Snake');
      expect(snakeEvent?.params?.game_id).toBe('snake');

      expect(carEvent).toBeDefined();
      expect(carEvent?.params?.game_name).toBe('Car Racing');
      expect(carEvent?.params?.game_id).toBe('car-racing');
    });
  });
});
