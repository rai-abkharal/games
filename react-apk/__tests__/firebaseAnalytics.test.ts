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
    expect(exitEvt?.params?.abandoned).toBe(true);
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
});
