/**
 * main.ts — boot: grab the DOM, wire input/audio, start the loop.
 */

import { Engine, Game, Input, Sfx } from './engine';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
const muteBtn = document.getElementById('btn-mute') as HTMLButtonElement | null;

if (canvas) {
  const sfx = new Sfx();
  const input = new Input(canvas);
  input.onGesture = () => sfx.init();

  const game = new Game(sfx, input);
  const engine = new Engine(canvas, game);

  if (muteBtn) {
    muteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      sfx.init();
      sfx.setMuted(!sfx.muted);
      muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
      muteBtn.blur();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) engine.stop(); else engine.start();
  });

  engine.start();
}
