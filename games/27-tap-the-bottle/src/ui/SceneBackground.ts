import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, GAME_HEIGHT, RENDER_SCALE, VERTICAL_SAFE_PADDING } from '../config/Constants';
import { ThemeType } from '../levels';

export function createSceneBackground(scene: Phaser.Scene, theme: ThemeType): void {
  const top = -VERTICAL_SAFE_PADDING;

  scene.cameras.main.setOrigin(0, 0);
  scene.cameras.main.setZoom(RENDER_SCALE);
  scene.cameras.main.setScroll(0, top);
  scene.cameras.main.setBackgroundColor(theme === 'pink' ? '#FEE1E4' : '#12B9D6');

  const graphics = scene.add.graphics().setDepth(0);
  if (theme === 'pink') {
    graphics.fillGradientStyle(0xFEE1E4, 0xFEE1E4, 0xFE9ADF, 0xFE9ADF, 1);
  } else {
    graphics.fillGradientStyle(0x12B9D6, 0x12B9D6, 0x0077D1, 0x0077D1, 1);
  }
  graphics.fillRect(0, top, DESIGN_WIDTH, GAME_HEIGHT);

  scene.add.tileSprite(
    DESIGN_WIDTH / 2,
    DESIGN_HEIGHT / 2,
    DESIGN_WIDTH,
    GAME_HEIGHT,
    'bg_pattern'
  ).setTileScale(1 / RENDER_SCALE).setDepth(1).setAlpha(0.52);
}
