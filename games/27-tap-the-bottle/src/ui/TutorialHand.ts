import Phaser from 'phaser';
import { RENDER_SCALE } from '../config/Constants';

export class TutorialHand {
  private container: Phaser.GameObjects.Container;
  private handSprite: Phaser.GameObjects.Image;
  private badgeContainer?: Phaser.GameObjects.Container;
  private bounceTween?: Phaser.Tweens.Tween;
  private pulseTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    targetX: number,
    targetY: number,
    text?: string,
    badgeOffsetY: number = -105
  ) {
    this.container = scene.add.container(targetX, targetY).setDepth(25);

    // 1. White pointing emoji hand pointing UP directly at the bottle
    this.handSprite = scene.add.image(0, 68, 'tutorial_hand')
      .setScale(0.95 / RENDER_SCALE);
    this.container.add(this.handSprite);

    this.bounceTween = scene.tweens.add({
      targets: this.handSprite,
      y: 52,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeInOut'
    });

    // 2. Optional cute speech badge / pill indicator
    if (text) {
      this.badgeContainer = scene.add.container(0, badgeOffsetY);

      const textObj = scene.add.text(0, 0, text, {
        fontFamily: 'Arial Rounded MT Bold, Trebuchet MS, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: '800',
        color: '#FFFFFF',
        resolution: RENDER_SCALE
      }).setOrigin(0.5, 0.5);

      const padX = 14;
      const padY = 7;
      const bgW = textObj.width + padX * 2;
      const bgH = textObj.height + padY * 2;

      const bg = scene.add.graphics();

      // Drop shadow
      bg.fillStyle(0x000000, 0.35);
      bg.fillRoundedRect(-bgW / 2, -bgH / 2 + 3, bgW, bgH, 12);

      // Dark slate pill body
      bg.fillStyle(0x0F172A, 0.94);
      bg.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 12);

      // Bright amber accent border
      bg.lineStyle(2.5, 0xF59E0B, 1.0);
      bg.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 12);

      // Little speech arrow pointer pointing down towards bottle
      bg.fillStyle(0x0F172A, 0.94);
      bg.beginPath();
      bg.moveTo(-6, bgH / 2);
      bg.lineTo(0, bgH / 2 + 6);
      bg.lineTo(6, bgH / 2);
      bg.closePath();
      bg.fill();

      bg.lineStyle(2.5, 0xF59E0B, 1.0);
      bg.beginPath();
      bg.moveTo(-6, bgH / 2);
      bg.lineTo(0, bgH / 2 + 6);
      bg.lineTo(6, bgH / 2);
      bg.stroke();

      this.badgeContainer.add([bg, textObj]);
      this.container.add(this.badgeContainer);

      // Subtle breathing pulse on the badge
      this.pulseTween = scene.tweens.add({
        targets: this.badgeContainer,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // Gentle pop-in entrance
    this.container.setScale(0.4);
    this.container.setAlpha(0);
    scene.tweens.add({
      targets: this.container,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });
  }

  public hide(): void {
    if (!this.container || !this.container.scene) return;
    if (this.bounceTween) this.bounceTween.stop();
    if (this.pulseTween) this.pulseTween.stop();

    this.container.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      scale: 0.4,
      duration: 180,
      onComplete: () => {
        this.destroy();
      }
    });
  }

  public destroy(): void {
    if (this.bounceTween) this.bounceTween.stop();
    if (this.pulseTween) this.pulseTween.stop();
    if (this.container && this.container.active) {
      this.container.destroy();
    }
  }
}
