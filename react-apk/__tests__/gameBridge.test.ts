import {
  BRIDGE_BOOTSTRAP_SCRIPT,
  DESTROY_SCRIPT,
  PAUSE_SCRIPT,
  buildPauseScript,
  buildResumeScript,
  buildSavedStateScript,
  parseGameMessage,
} from '../src/services/gameBridge';

describe('parseGameMessage (parity with NativeGameBridge.handleIncomingMessage)', () => {
  test('GameBridge {action,payload} messages', () => {
    expect(parseGameMessage(JSON.stringify({ action: 'ready', payload: {} }))).toEqual({ type: 'ready' });
    expect(parseGameMessage(JSON.stringify({ action: 'gameOver', payload: { score: 420 } }))).toEqual({
      type: 'gameOver',
      score: 420,
      stats: JSON.stringify({ score: 420 }),
    });
    expect(parseGameMessage(JSON.stringify({ action: 'completed', payload: { score: 90, level: 3 } }))).toEqual({
      type: 'completed',
      score: 90,
      level: 3,
    });
  });

  test('legacy upper-case action names and top-level fields', () => {
    expect(parseGameMessage(JSON.stringify({ type: 'GAME_OVER', score: 7 }))).toMatchObject({ type: 'gameOver', score: 7 });
    expect(parseGameMessage(JSON.stringify({ type: 'LEVEL_COMPLETED', level: 2 }))).toEqual({
      type: 'completed',
      score: 0,
      level: 2,
    });
    expect(parseGameMessage(JSON.stringify({ action: 'SCORE_EARNED', payload: { points: 55 } }))).toEqual({
      type: 'earnCoins',
      amount: 5,
    });
  });

  test('string numbers from direct NativeBridge calls are parsed', () => {
    expect(parseGameMessage(JSON.stringify({ action: 'gameOver', payload: { score: '123', stats: '' } }))).toMatchObject({
      type: 'gameOver',
      score: 123,
    });
    expect(parseGameMessage(JSON.stringify({ action: 'saveLevelState', payload: { level: '4' } }))).toEqual({
      type: 'saveLevelState',
      level: 4,
    });
  });

  test('unknown or malformed input never throws', () => {
    expect(parseGameMessage('not json')).toBeNull();
    expect(parseGameMessage(JSON.stringify({ action: 'launchMissiles' }))).toBeNull();
    expect(parseGameMessage('null')).toBeNull();
    expect(parseGameMessage(JSON.stringify({ action: 'haptic', payload: { type: 'nuclear' } }))).toEqual({
      type: 'haptic',
      haptic: 'light',
    });
  });
});

describe('injected scripts', () => {
  test('bootstrap exposes both bridge globals the games expect', () => {
    expect(BRIDGE_BOOTSTRAP_SCRIPT).toContain('window.FlutterGameBridge = native');
    expect(BRIDGE_BOOTSTRAP_SCRIPT).toContain('window.NativeBridge = native');
    expect(BRIDGE_BOOTSTRAP_SCRIPT).toContain('ReactNativeWebView.postMessage');
    // injectedJavaScriptBeforeContentLoaded must evaluate to a serialisable value
    expect(BRIDGE_BOOTSTRAP_SCRIPT.trim().endsWith('true;')).toBe(true);
  });

  test('frame gate: bootstrap installs it, pause parks frames, resume releases them', () => {
    expect(BRIDGE_BOOTSTRAP_SCRIPT).toContain('window.__SP_RAF__ = gate');
    expect(BRIDGE_BOOTSTRAP_SCRIPT).toContain('window.requestAnimationFrame = function');
    expect(PAUSE_SCRIPT).toContain('__SP_RAF__.pause(0)');
    expect(buildPauseScript(90)).toContain('__SP_RAF__.pause(90)');
    expect(buildPauseScript(-5)).toContain('__SP_RAF__.pause(0)');
    expect(buildResumeScript(true)).toContain('__SP_RAF__.resume()');
    expect(DESTROY_SCRIPT).toContain('__SP_RAF__.pause(0)');
  });

  test('resume script toggles sound and saved state is number-safe', () => {
    expect(buildResumeScript(true)).toContain('sound.mute = !true');
    expect(buildResumeScript(false)).toContain('setSoundEnabled(false)');
    expect(buildSavedStateScript({ level: 3, coins: 120, highScore: 999 })).toContain(
      '{"level":3,"coins":120,"highScore":999}',
    );
  });
});
