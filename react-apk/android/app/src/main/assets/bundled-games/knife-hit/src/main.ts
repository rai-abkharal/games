import { W, H, VIEW } from './config';
import { BootScene, MenuScene, KnivesScene } from './menus';
import { GameScene } from './game';
import { sfx } from './sfx';

// The world is always exactly W (480) logical units wide. The height flexes to match the
// phone's real aspect ratio, so the canvas fills the whole screen with NO letterbox bars.
// We render at a device-pixel-capped resolution and drive a camera that maps the full window
// onto [0..W] x [0..VIEW.h]. See applyViewport().
function computeView(): void {
  const w = window.innerWidth, h = window.innerHeight;
  VIEW.w = W;
  VIEW.h = Math.round((h / w) * W);   // logical height for this screen (portrait -> > 800)
}
computeView();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'stage',
  backgroundColor: '#0b0d16',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  input: { activePointers: 2 },
  scene: [BootScene, MenuScene, KnivesScene, GameScene],
};

window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
window.addEventListener('keydown', () => sfx.unlock(), { once: true });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

const game = new Phaser.Game(config);
// Optional: open index.html#stage=42 to jump straight to a stage (handy for testing).
const m = /stage=(\d+)/.exec(location.hash);
if (m) game.registry.set('startStage', Number(m[1]));
(window as unknown as { __kh: Phaser.Game }).__kh = game;

// Keep VIEW.h in step with the window and let the active scene relayout.
game.scale.on('resize', () => {
  computeView();
  const active = game.scene.getScenes(true);
  for (const sc of active) (sc as unknown as { onResize?: () => void }).onResize?.();
});
