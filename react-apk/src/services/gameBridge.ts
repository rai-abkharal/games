import type { GameToHostMessage, HapticType, SavedGameState } from '../types/bridge';
import { toInt } from '../utils/misc';

/* ------------------------------------------------------------------------ */
/* Game → host                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Injected before any game script runs. It recreates the two globals the
 * games were written against for the native app — `FlutterGameBridge`
 * (JSON `{action,payload}` messages) and `NativeBridge` (direct method
 * calls) — and forwards everything through the single channel
 * react-native-webview exposes, `window.ReactNativeWebView.postMessage`.
 *
 * It also hooks AudioContext creation like GameFeedAdapter.onPageStarted so
 * the pause script can silence every context a game ever created, and it
 * installs a frame gate around requestAnimationFrame. The native app relies
 * on WebView.onPause() to stop background pages rendering; React Native has
 * no such hook, and only a couple of games expose an engine handle the pause
 * script can put to sleep. Parking rAF requests while a page is in the
 * background freezes every game loop regardless of how the game was built.
 * Engines look `window.requestAnimationFrame` up on every frame, so the patch
 * also works for games whose loop started before the gate was installed.
 */
export const BRIDGE_BOOTSTRAP_SCRIPT = `
(function () {
  if (window.__SP_BRIDGE_READY__) return;
  window.__SP_BRIDGE_READY__ = true;

  function send(action, payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ action: action, payload: payload || {} }));
    } catch (e) {}
  }

  function postMessage(raw) {
    try {
      window.ReactNativeWebView.postMessage(typeof raw === 'string' ? raw : JSON.stringify(raw));
    } catch (e) {}
  }

  var native = {
    postMessage: postMessage,
    ready: function () { send('ready'); },
    gameStarted: function () { send('gameStarted'); },
    gameOver: function (score, stats) { send('gameOver', { score: score, stats: stats }); },
    completed: function (score, level) { send('completed', { score: score, level: level }); },
    setSwipeEnabled: function (enabled) { send('setSwipeEnabled', { enabled: !!enabled }); },
    haptic: function (type) { send('haptic', { type: type }); },
    earnCoins: function (amount) { send('earnCoins', { amount: amount }); },
    addScore: function (points) { send('addScore', { points: points }); },
    requestHint: function (action) { send('requestHint', { action: action }); },
    saveLevelState: function (level) { send('saveLevelState', { level: level }); },
    showRewardedAd: function (type) { send('showRewardedAd', { type: type }); }
  };

  window.FlutterGameBridge = native;
  window.NativeBridge = native;

  if (!window.__ALL_AUDIO_CONTEXTS__) {
    window.__ALL_AUDIO_CONTEXTS__ = [];
    var OrigCtx = window.AudioContext || window.webkitAudioContext;
    if (OrigCtx) {
      var HookedCtx = function () {
        var args = Array.prototype.slice.call(arguments);
        var ctx;
        try {
          ctx = new (Function.prototype.bind.apply(OrigCtx, [null].concat(args)))();
        } catch (e) {
          ctx = new OrigCtx();
        }
        window.__ALL_AUDIO_CONTEXTS__.push(ctx);
        return ctx;
      };
      HookedCtx.prototype = OrigCtx.prototype;
      window.AudioContext = HookedCtx;
      window.webkitAudioContext = HookedCtx;
    }
  }

  if (!window.__SP_RAF__ && typeof window.requestAnimationFrame === 'function') {
    var origRaf = window.requestAnimationFrame.bind(window);
    var origCaf = typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame.bind(window) : null;
    var gate = { active: true, frames: 0, freezeAt: 0, pending: [], nextId: -1 };
    window.__SP_RAF__ = gate;
    var schedule = function (cb) {
      return origRaf(function (ts) { gate.frames++; cb(ts); });
    };
    window.requestAnimationFrame = function (cb) {
      if (gate.active) {
        if (gate.freezeAt > 0 && gate.frames >= gate.freezeAt) {
          gate.active = false;
          gate.freezeAt = 0;
        } else {
          return schedule(cb);
        }
      }
      var id = gate.nextId--;
      gate.pending.push({ id: id, cb: cb });
      return id;
    };
    window.cancelAnimationFrame = function (id) {
      if (id < 0) {
        for (var i = 0; i < gate.pending.length; i++) {
          if (gate.pending[i].id === id) { gate.pending.splice(i, 1); return; }
        }
      } else if (origCaf) {
        origCaf(id);
      }
    };
    gate.pause = function (graceFrames) {
      if (graceFrames > 0) {
        gate.freezeAt = gate.frames + graceFrames;
      } else {
        gate.active = false;
        gate.freezeAt = 0;
      }
    };
    gate.resume = function () {
      gate.active = true;
      gate.freezeAt = 0;
      var list = gate.pending;
      gate.pending = [];
      var seen = typeof Set === 'function' ? new Set() : null;
      for (var i = list.length - 1; i >= 0; i--) {
        var cb = list[i].cb;
        if (seen) {
          if (seen.has(cb)) continue;
          seen.add(cb);
        }
        schedule(cb);
      }
    };
  }
})();
true;
`;

const HAPTICS: ReadonlySet<string> = new Set(['light', 'medium', 'heavy', 'success', 'warning', 'error']);

function pickInt(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const value = toInt(candidate, Number.NaN);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return undefined;
}

/**
 * Parses a raw WebView message into a typed host event. Mirrors
 * NativeGameBridge.handleIncomingMessage, including the alternative action
 * names (GAME_OVER, LEVEL_COMPLETED, …) that third-party uploads use.
 * Returns null for anything unrecognised so a misbehaving game can't crash us.
 */
export function parseGameMessage(raw: string): GameToHostMessage | null {
  let obj: any;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const action: string = String(obj.action ?? obj.type ?? '');
  const payload: any = obj.payload && typeof obj.payload === 'object' ? obj.payload : {};

  switch (action) {
    case 'ready':
      return { type: 'ready' };
    case 'gameStarted':
      return { type: 'gameStarted' };
    case 'paused':
      return { type: 'paused' };
    case 'resumed':
      return { type: 'resumed' };
    case 'gameOver':
    case 'GAME_OVER': {
      const score = pickInt(payload.score, obj.score, payload.finalScore) ?? 0;
      const stats =
        payload.stats && typeof payload.stats === 'object'
          ? JSON.stringify(payload.stats)
          : typeof payload.stats === 'string'
            ? payload.stats
            : Object.keys(payload).length
              ? JSON.stringify(payload)
              : '';
      return { type: 'gameOver', score, stats };
    }
    case 'completed':
    case 'GAME_COMPLETED':
    case 'LEVEL_COMPLETED': {
      const score = pickInt(payload.score, obj.score) ?? 0;
      const level = Math.max(1, pickInt(payload.level, obj.level) ?? 1);
      return { type: 'completed', score, level };
    }
    case 'setSwipeEnabled':
      return { type: 'setSwipeEnabled', enabled: payload.enabled !== false };
    case 'haptic': {
      const type = String(payload.type ?? 'light');
      return { type: 'haptic', haptic: (HAPTICS.has(type) ? type : 'light') as HapticType };
    }
    case 'earnCoins':
    case 'COINS_EARNED':
    case 'addCoins':
      return { type: 'earnCoins', amount: Math.max(1, pickInt(payload.amount, obj.amount) ?? 10) };
    case 'addScore':
    case 'SCORE_EARNED': {
      const points = pickInt(payload.points, obj.score, payload.score) ?? 10;
      return { type: 'earnCoins', amount: Math.max(1, Math.floor(points / 10)) };
    }
    case 'requestHint':
    case 'REQUEST_HINT':
      return { type: 'requestHint', action: String(payload.action ?? 'hint') };
    case 'saveLevelState':
    case 'SAVE_LEVEL':
      return { type: 'saveLevelState', level: Math.max(1, pickInt(payload.level, obj.level) ?? 1) };
    case 'showRewardedAd':
    case 'SHOW_REWARDED_AD':
      return { type: 'showRewardedAd', rewardType: String(payload.type ?? 'hint') };
    case 'metrics':
      return {
        type: 'metrics',
        fps: Number(payload.fps) || 0,
        frameTimeMs: Number(payload.frameTimeMs) || 0,
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Host → game (scripts run with injectJavaScript)                          */
/* ------------------------------------------------------------------------ */

const js = (body: string) => `(function(){${body}})();true;`;

/**
 * Freezes the engine, animations and audio — GameFeedAdapter.buildGamePauseScript
 * plus the frame gate. `graceFrames > 0` lets a page that has just finished
 * loading render its first frames (title screen, boot animation) before it is
 * frozen, so the page a player swipes to already shows the game rather than
 * a blank canvas. Pass 0 to freeze immediately (app backgrounded, page left).
 */
export function buildPauseScript(graceFrames = 0): string {
  const grace = Math.max(0, Math.floor(graceFrames));
  return js(`
  window.__GAME_ACTIVE__ = false;
  try {
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    if (window.onblur) window.onblur();
  } catch (e) {}
  try {
    var styleEl = document.getElementById('__freeze_css_style__');
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = '__freeze_css_style__'; document.head.appendChild(styleEl); }
    styleEl.textContent = 'body, #game, #app, canvas { animation-play-state: paused !important; -webkit-animation-play-state: paused !important; }';
  } catch (e) {}
  try {
    var g = window.__PHASER_GAME__;
    if (g) {
      if (g.loop) g.loop.sleep();
      if (g.sound) { g.sound.mute = true; if (g.sound.context && typeof g.sound.context.suspend === 'function') g.sound.context.suspend(); }
      if (g.scene && g.scene.scenes) g.scene.scenes.forEach(function (s) {
        if (s.scene && typeof s.scene.pause === 'function') s.scene.pause();
        if (s.tweens && typeof s.tweens.pauseAll === 'function') s.tweens.pauseAll();
        if (s.anims && typeof s.anims.pauseAll === 'function') s.anims.pauseAll();
        if (s.time && s.time.paused !== undefined) s.time.paused = true;
        if (s.physics && s.physics.world && typeof s.physics.world.pause === 'function') {
          s.physics.world.pause();
          if (s.physics.world.accumulator !== undefined) s.physics.world.accumulator = 0;
        }
      });
    }
  } catch (e) {}
  try { if (window.PIXI && window.PIXI.Ticker && window.PIXI.Ticker.shared) window.PIXI.Ticker.shared.stop(); } catch (e) {}
  try {
    if (window.__ALL_AUDIO_CONTEXTS__) window.__ALL_AUDIO_CONTEXTS__.forEach(function (ctx) { if (ctx && typeof ctx.suspend === 'function' && ctx.state === 'running') ctx.suspend(); });
    var media = document.querySelectorAll('audio, video');
    for (var i = 0; i < media.length; i++) { media[i].pause(); media[i].muted = true; }
    if (window.Howler && typeof window.Howler.mute === 'function') window.Howler.mute(true);
    ['audioCtx', 'soundCtx', 'audioContext'].forEach(function (k) { var c = window[k]; if (c && typeof c.suspend === 'function') c.suspend(); });
    if (window.SoundFx && window.SoundFx.ctx && typeof window.SoundFx.ctx.suspend === 'function') window.SoundFx.ctx.suspend();
  } catch (e) {}
  try {
    if (window.GameBridge) {
      if (typeof window.GameBridge.setSoundEnabled === 'function') window.GameBridge.setSoundEnabled(false);
      if (typeof window.GameBridge.pause === 'function') window.GameBridge.pause();
      if (typeof window.GameBridge.onPause === 'function') window.GameBridge.onPause();
    }
    window.dispatchEvent(new Event('flutter:pause'));
  } catch (e) {}
  try { if (window.__SP_RAF__) window.__SP_RAF__.pause(${grace}); } catch (e) {}
`);
}

/** Immediate freeze (app backgrounded, screen left, page swiped away). */
export const PAUSE_SCRIPT = buildPauseScript(0);

/** Wakes the engine and (optionally) audio — GameFeedAdapter.buildGameResumeScript. */
export function buildResumeScript(soundEnabled: boolean): string {
  const sound = soundEnabled ? 'true' : 'false';
  return js(`
    window.__GAME_ACTIVE__ = true;
    try { if (window.__SP_RAF__) window.__SP_RAF__.resume(); } catch (e) {}
    try {
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      if (window.onfocus) window.onfocus();
    } catch (e) {}
    try { var styleEl = document.getElementById('__freeze_css_style__'); if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); } catch (e) {}
    try {
      var g = window.__PHASER_GAME__;
      if (g) {
        if (g.loop) {
          if (typeof g.loop.resetDelta === 'function') g.loop.resetDelta();
          g.loop.actualFps = 60;
          g.loop.delta = 16.666;
          g.loop.lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          g.loop.wake();
        }
        if (g.sound) { g.sound.mute = !${sound}; if (${sound} && g.sound.context && g.sound.context.state === 'suspended') g.sound.context.resume(); }
        if (g.scene && g.scene.scenes) g.scene.scenes.forEach(function (s) {
          if (s.time && s.time.paused !== undefined) s.time.paused = false;
          if (s.time && typeof s.time.now === 'number') s.time.now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          if (s.scene && typeof s.scene.resume === 'function') s.scene.resume();
          if (s.tweens && typeof s.tweens.resumeAll === 'function') s.tweens.resumeAll();
          if (s.anims && typeof s.anims.resumeAll === 'function') s.anims.resumeAll();
          if (s.physics && s.physics.world) {
            if (typeof s.physics.world.resume === 'function') s.physics.world.resume();
            if (s.physics.world.accumulator !== undefined) s.physics.world.accumulator = 0;
            if (s.physics.world.prev !== undefined) s.physics.world.prev = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          }
          if (s.input) {
            s.input.enabled = true;
            if (typeof s.input.processQueue === 'function') s.input.processQueue();
          }
        });
        if (g.input) g.input.enabled = true;
      }
    } catch (e) {}
    try { if (window.PIXI && window.PIXI.Ticker && window.PIXI.Ticker.shared) window.PIXI.Ticker.shared.start(); } catch (e) {}
    try {
      if (${sound}) {
        if (window.__ALL_AUDIO_CONTEXTS__) window.__ALL_AUDIO_CONTEXTS__.forEach(function (ctx) { if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') ctx.resume(); });
        var media = document.querySelectorAll('audio, video');
        for (var i = 0; i < media.length; i++) media[i].muted = false;
        if (window.Howler && typeof window.Howler.mute === 'function') window.Howler.mute(false);
        ['audioCtx', 'soundCtx', 'audioContext'].forEach(function (k) { var c = window[k]; if (c && c.state === 'suspended') c.resume(); });
        if (window.SoundFx && window.SoundFx.ctx && window.SoundFx.ctx.state === 'suspended') window.SoundFx.ctx.resume();
      }
    } catch (e) {}
    try {
      if (window.GameBridge) {
        if (typeof window.GameBridge.setSoundEnabled === 'function') window.GameBridge.setSoundEnabled(${sound});
        if (typeof window.GameBridge.resume === 'function') window.GameBridge.resume();
        if (typeof window.GameBridge.onResume === 'function') window.GameBridge.onResume();
        if (window.__NEEDS_FRESH_START__ === true || window.__GAME_OVER_TRIGGERED__ === true) {
          window.__NEEDS_FRESH_START__ = false; window.__GAME_OVER_TRIGGERED__ = false;
          if (typeof window.GameBridge.restart === 'function') window.GameBridge.restart();
        }
      }
      window.dispatchEvent(new Event('flutter:resume'));
    } catch (e) {}
    try {
      window.focus();
      if (document.body && typeof document.body.focus === 'function') document.body.focus();
      var canvas = document.querySelector('canvas');
      if (canvas && typeof canvas.focus === 'function') canvas.focus();
    } catch (e) {}
  `);
}

/** Sound toggle for the game on screen — GameFeedAdapter.setSoundMuted. */
export function buildSoundScript(enabled: boolean): string {
  const flag = enabled ? 'true' : 'false';
  return js(`
    if (window.GameBridge && typeof window.GameBridge.setSoundEnabled === 'function') window.GameBridge.setSoundEnabled(${flag});
    if (window.__PHASER_GAME__ && window.__PHASER_GAME__.sound) window.__PHASER_GAME__.sound.mute = !${flag};
    try { window.dispatchEvent(new CustomEvent('flutter:sound', { detail: { enabled: ${flag} } })); } catch (e) {}
  `);
}

export const RESTART_SCRIPT = js(`
  if (window.GameBridge && typeof window.GameBridge.restart === 'function') window.GameBridge.restart();
  else window.dispatchEvent(new Event('flutter:restart'));
`);

export function buildRewardScript(rewardType: string): string {
  const type = JSON.stringify(rewardType);
  return js(`
    window.postMessage({ type: 'REWARD_GRANTED', action: ${type} }, '*');
    if (window.GameBridge && typeof window.GameBridge.onRewardGranted === 'function') window.GameBridge.onRewardGranted(${type});
  `);
}

export function buildSavedStateScript(state: SavedGameState): string {
  const payload = JSON.stringify({
    level: toInt(state.level, 1),
    coins: toInt(state.coins, 0),
    highScore: toInt(state.highScore, 0),
  });
  return js(`
    window.postMessage({ type: 'LOAD_SAVED_STATE', payload: ${payload} }, '*');
    if (window.GameBridge && typeof window.GameBridge.loadSavedState === 'function') window.GameBridge.loadSavedState(${payload});
  `);
}

/** Tears the engine down before the WebView is recycled (GameViewHolder.cleanup). */
export const DESTROY_SCRIPT = js(`
  try { if (window.__SP_RAF__) { window.__SP_RAF__.pause(0); window.__SP_RAF__.pending = []; } } catch (e) {}
  try { if (window.__PHASER_GAME__ && window.__PHASER_GAME__.destroy) window.__PHASER_GAME__.destroy(true); } catch (e) {}
  try { if (window.GameBridge && typeof window.GameBridge.destroy === 'function') window.GameBridge.destroy(); } catch (e) {}
`);
