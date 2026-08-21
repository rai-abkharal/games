/**
 * main.ts — entry point. Grabs the DOM, wires the input manager, audio and
 * engine together, and kicks off the loop. The game starts straight into
 * PLAYING: no menus, no pause screen.
 */

import { Input, Sfx, Game, Engine } from './engine';

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  const stage = document.getElementById('stage');
  const leftBtn = document.getElementById('btn-left');
  const rightBtn = document.getElementById('btn-right');
  const muteBtn = document.getElementById('btn-mute');
  if (!canvas || !stage || !leftBtn || !rightBtn) {
    throw new Error('Endless Racer: required DOM nodes are missing');
  }

  const sfx = new Sfx();
  const input = new Input(stage, leftBtn, rightBtn);
  input.onGesture = () => sfx.init();

  const game = new Game(input, sfx);
  const engine = new Engine(canvas, game);
  engine.start();

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      sfx.init();
      const muted = sfx.toggleMute();
      muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    });
  }

  // Stop scroll/zoom gestures from fighting the controls on mobile.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Register the service-worker-free PWA manifest hooks (installability only).
  window.addEventListener('beforeinstallprompt', () => { /* handled by the browser UI */ });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
