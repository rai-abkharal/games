import Phaser from 'phaser';
import { RENDER_SCALE } from '../config/Constants';

export class TutorialHand {
  private sprite: Phaser.GameObjects.Image;
  private tween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, targetX: number, targetY: number) {
    this.sprite = scene.add.image(targetX + 30, targetY + 20, 'tutorial_hand')
      .setDepth(22)
      .setScale(0.9 / RENDER_SCALE);

    this.tween = scene.tweens.add({
      targets: this.sprite,
      x: targetX + 15,
      y: targetY + 10,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  public hide(): void {
    if (!this.sprite || !this.sprite.active) return;
    this.tween.stop();
    this.sprite.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 0.5 / RENDER_SCALE,
      duration: 200,
      onComplete: () => {
        this.sprite.destroy();
      }
    });
  }

  public destroy(): void {
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
