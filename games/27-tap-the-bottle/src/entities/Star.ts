import Phaser from 'phaser';
import { COLLISION_CATEGORIES } from '../config/Constants';

export class Star {
  public sprite: Phaser.Physics.Matter.Sprite;
  public collected: boolean = false;
  public x: number;
  public y: number;
  private idleTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;

    // Matter Sprite as sensor circle
    this.sprite = scene.matter.add.sprite(x, y, 'star', undefined, {
      isSensor: true,
      isStatic: true,
      label: 'star',
      collisionFilter: {
        category: COLLISION_CATEGORIES.STAR,
        mask: COLLISION_CATEGORIES.PROJECTILE
      }
    });

    this.sprite.setCircle(22);
    this.sprite.setDepth(8);
    this.sprite.setData('entity', this);

    // Subtle idle float animation
    this.idleTween = scene.tweens.add({
      targets: this.sprite,
      y: y - 4,
      duration: 1200 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  public collect(): void {
    if (this.collected) return;
    this.collected = true;

    // Stop idle float tween immediately
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween.remove();
      this.idleTween = undefined;
    }

    // Disable physics body immediately
    if (this.sprite && this.sprite.body) {
      this.sprite.scene.matter.world.remove(this.sprite.body);
    }

    // Quick scale burst & fade
    if (this.sprite && this.sprite.scene) {
      this.sprite.scene.tweens.add({
        targets: this.sprite,
        scale: 1.4,
        alpha: 0,
        duration: 180,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.destroy();
        }
      });
    }
  }

  public destroy(): void {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween.remove();
      this.idleTween = undefined;
    }
    if (this.sprite && this.sprite.active) {
      if (this.sprite.body && this.sprite.scene) {
        this.sprite.scene.matter.world.remove(this.sprite.body);
      }
      this.sprite.destroy();
    }
  }
}
