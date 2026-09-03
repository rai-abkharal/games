import Phaser from 'phaser';
import { COLLISION_CATEGORIES } from '../config/Constants';

export class Star {
  public sprite: Phaser.GameObjects.Image;
  public body: MatterJS.BodyType;
  public collected: boolean = false;
  public x: number;
  public y: number;
  private idleTween?: Phaser.Tweens.Tween;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // Visual image (completely decoupled from Matter body getters)
    this.sprite = scene.add.image(x, y, 'star')
      .setDisplaySize(64, 64)
      .setDepth(8);

    // Static Matter sensor circle for precise collision detection
    this.body = scene.matter.add.circle(x, y, 32, {
      isSensor: true,
      isStatic: true,
      label: 'star',
      collisionFilter: {
        category: COLLISION_CATEGORIES.STAR,
        mask: COLLISION_CATEGORIES.PROJECTILE
      }
    });

    // Store reference to this entity on the body
    (this.body as unknown as { starEntity: Star }).starEntity = this;

    // Gentle idle float animation
    this.idleTween = scene.tweens.add({
      targets: this.sprite,
      y: y - 5,
      duration: 1200 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  public isCollected(): boolean {
    return this.collected;
  }

  public collect(): void {
    if (this.collected) return;
    this.collected = true;

    // 1. Remove Matter sensor body immediately
    if (this.body && this.scene && this.scene.matter) {
      this.scene.matter.world.remove(this.body);
    }

    // 2. Stop idle float animation
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = undefined;
    }

    // 3. Play collect scale burst & fade
    if (this.sprite && this.sprite.active) {
      this.scene.tweens.add({
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
      this.idleTween = undefined;
    }
    if (this.body && this.scene && this.scene.matter) {
      this.scene.matter.world.remove(this.body);
    }
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
