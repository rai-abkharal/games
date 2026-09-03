import Phaser from 'phaser';
import { DESIGN_WIDTH } from '../config/Constants';
import { AudioManager } from '../systems/AudioManager';

export class Hud {
  private scene: Phaser.Scene;
  private levelText: Phaser.GameObjects.Text;
  private homeBtn: Phaser.GameObjects.Image;
  private restartBtn: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, levelNumber: number, onHome: () => void, onRestart: () => void) {
    this.scene = scene;

    // 1. Home Button (Top-Left hugging edge like reference video)
    this.homeBtn = scene.add.image(28, 48, 'btn_home')
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    this.homeBtn.on('pointerdown', () => {
      AudioManager.playButton();
      scene.tweens.add({
        targets: this.homeBtn,
        scale: 0.88,
        duration: 80,
        yoyo: true,
        onComplete: onHome
      });
    });

    // 2. Level Text ("Level X", centered, white friendly sans-serif)
    this.levelText = scene.add.text(DESIGN_WIDTH / 2, 48, `Level ${levelNumber}`, {
      fontFamily: 'Outfit, system-ui, sans-serif',
      fontSize: '32px',
      fontStyle: '700',
      color: '#FFFFFF'
    }).setOrigin(0.5, 0.5).setDepth(20);

    // 3. Restart Button (Top-Right hugging edge like reference video)
    this.restartBtn = scene.add.image(DESIGN_WIDTH - 28, 48, 'btn_restart')
      .setDepth(20)
      .setInteractive({ useHandCursor: true });

    this.restartBtn.on('pointerdown', () => {
      AudioManager.playButton();
      scene.tweens.add({
        targets: this.restartBtn,
        scale: 0.88,
        duration: 80,
        yoyo: true,
        onComplete: onRestart
      });
    });
  }

  public setLevel(levelNumber: number): void {
    this.levelText.setText(`Level ${levelNumber}`);
  }

  public destroy(): void {
    this.homeBtn.destroy();
    this.levelText.destroy();
    this.restartBtn.destroy();
  }
}
