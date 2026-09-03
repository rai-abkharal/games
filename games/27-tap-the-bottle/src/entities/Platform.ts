import Phaser from 'phaser';
import { COLLISION_CATEGORIES } from '../config/Constants';

export class Platform {
  public sprite: Phaser.GameObjects.TileSprite | Phaser.GameObjects.NineSlice;
  public body: MatterJS.BodyType;
  public x: number;
  public y: number;
  public width: number;
  public height: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number = 0,
    type: 'wood' | 'blue' = 'wood'
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    const textureKey = type === 'blue' ? 'platform_blue' : 'platform_wood';

    // Visual nine-slice or stretched sprite
    const rad = Phaser.Math.DegToRad(rotation);

    // Create Matter static rectangle body
    const matterBody = scene.matter.add.rectangle(x, y, width, height, {
      isStatic: true,
      label: 'platform',
      friction: 0.15,
      restitution: 0.45,
      chamfer: { radius: 8 },
      collisionFilter: {
        category: COLLISION_CATEGORIES.PLATFORM,
        mask: COLLISION_CATEGORIES.PROJECTILE | COLLISION_CATEGORIES.LAUNCHER
      }
    });

    scene.matter.body.setAngle(matterBody, rad);
    this.body = matterBody;

    // Visual sprite
    this.sprite = scene.add.tileSprite(x, y, width, height, textureKey)
      .setRotation(rad)
      .setDepth(6);
  }

  public destroy(): void {
    if (this.sprite) this.sprite.destroy();
  }
}
