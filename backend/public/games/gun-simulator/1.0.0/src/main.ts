/** main.ts — boot: create the Pixi app, load embedded textures, start the game. */
import { Application } from 'pixi.js';
import { Sfx } from './audio';
import { VIEW_H, VIEW_W } from './data';
import { Game, loadTextures } from './game';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const boot = document.getElementById('boot');
  const app = new Application();
  await app.init({
    canvas, width: VIEW_W, height: VIEW_H, background: 0x6e798c, antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2.5), autoDensity: true, preference: 'webgl',
  });
  let game: Game | null = null;
  const fit = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ratio = vh / vw;
    let targetW = VIEW_W;
    let targetH = VIEW_H;

    if (ratio >= VIEW_H / VIEW_W) {
      targetH = Math.round(VIEW_W * ratio);
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
    } else {
      const s = Math.min(vw / VIEW_W, vh / VIEW_H);
      canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
      canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
    }

    app.renderer.resize(targetW, targetH);
    if (game) game.relayout(targetH);
  };
  fit();
  window.addEventListener('resize', fit);
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  const sfx = new Sfx();
  const tex = await loadTextures();
  game = new Game(app, tex, sfx);
  fit();
  (window as any).__game = game;
  boot?.remove();

  // fixed timestep, render once per frame
  let acc = 0; const step = 1 / 60;
  app.ticker.add((t) => {
    acc += Math.min(t.deltaMS / 1000, 0.25);
    let n = 0;
    while (acc >= step && n < 5) { game!.update(step); acc -= step; n++; }
    if (n === 5) acc = 0;
  });
}

boot().catch((e) => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'FAILED TO START: ' + e; });
