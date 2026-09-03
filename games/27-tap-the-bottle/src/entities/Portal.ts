import Phaser from 'phaser';
import { COLLISION_CATEGORIES } from '../config/Constants';

export class Portal {
  public id: string;
  public pairId: string;
  public sprite: Phaser.GameObjects.Sprite;
  public sensor: MatterJS.BodyType;
  public x: number;
  public y: number;
  public rotation: number;
  public exitOffsetX: number;
  public exitOffsetY: number;

  constructor(
    scene: Phaser.Scene,
    id: string,
    pairId: string,
    x: number,
    y: number,
    rotation: number = 0,
    exitOffsetX: number = 0,
    exitOffsetY: number = 0
  ) {
    this.id = id;
    this.pairId = pairId;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.exitOffsetX = exitOffsetX;
    this.exitOffsetY = exitOffsetY;

    const rad = Phaser.Math.DegToRad(rotation);

    this.sprite = scene.add.sprite(x, y, 'portal')
      .setRotation(rad)
      .setDepth(7);

    // Matter sensor body
    this.sensor = scene.matter.add.circle(x, y, 24, {
      isSensor: true,
      isStatic: true,
      label: 'portal',
      collisionFilter: {
        category: COLLISION_CATEGORIES.PORTAL,
        mask: COLLISION_CATEGORIES.PROJECTILE
      }
    });
    (this.sensor as any).portalEntity = this;

    // Gentle pulse tween
    scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.08,
      scaleY: 1.08,
      alpha: 0.88,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  public destroy(): void {
    if (this.sprite) this.sprite.destroy();
  }
}
