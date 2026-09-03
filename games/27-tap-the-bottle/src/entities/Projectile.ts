import Phaser from 'phaser';
import { COLLISION_CATEGORIES, DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/Constants';

export class Projectile {
  public sprite: Phaser.Physics.Matter.Sprite;
  public color: string;
  public type: 'crownCap' | 'canTab';
  public active: boolean = true;
  public portalCooldown: number = 0;
  public prevX: number = 0;
  public prevY: number = 0;
  private stillTimer: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: 'crownCap' | 'canTab',
    color: string
  ) {
    this.type = type;
    this.color = color;
    this.prevX = x;
    this.prevY = y;

    const textureKey = type === 'crownCap' ? 'crown_cap' : 'can_tab';

    this.sprite = scene.matter.add.sprite(x, y, textureKey, undefined, {
      label: 'projectile',
      friction: 0.08,
      frictionAir: 0.006,
      restitution: 0.68,
      density: 0.0012,
      chamfer: { radius: 6 },
      collisionFilter: {
        category: COLLISION_CATEGORIES.PROJECTILE,
        mask: COLLISION_CATEGORIES.PLATFORM | COLLISION_CATEGORIES.STAR | COLLISION_CATEGORIES.PORTAL
      }
    });

    this.sprite.setDepth(10);
    this.sprite.setDisplaySize(type === 'crownCap' ? 48 : 40, type === 'crownCap' ? 32 : 28);
    this.sprite.setData('entity', this);
    if (this.sprite.body) {
      (this.sprite.body as any).projectileEntity = this;
    }
  }

  public setVelocity(vx: number, vy: number): void {
    if (this.sprite.body) {
      this.sprite.setVelocity(vx, vy);
    }
  }

  public setAngularVelocity(angularVelocity: number): void {
    if (this.sprite.body) {
      this.sprite.setAngularVelocity(angularVelocity);
    }
  }

  public update(delta: number): void {
    if (!this.active || !this.sprite.body) return;

    this.prevX = this.sprite.x;
    this.prevY = this.sprite.y;

    const dt = delta / 1000;
    if (this.portalCooldown > 0) {
      this.portalCooldown -= delta;
    }

    const vx = this.sprite.body.velocity.x;
    const vy = this.sprite.body.velocity.y;
    const speedSq = vx * vx + vy * vy;

    // Boundary bounces to keep projectile in playable screen
    if (this.sprite.y < 16 && vy < 0) {
      this.sprite.setPosition(this.sprite.x, 16);
      this.sprite.setVelocity(vx * 0.9, Math.abs(vy) * 0.65);
    }
    if (this.sprite.x < 16 && vx < 0) {
      this.sprite.setPosition(16, this.sprite.y);
      this.sprite.setVelocity(-vx * 0.75, vy);
    } else if (this.sprite.x > DESIGN_WIDTH - 16 && vx > 0) {
      this.sprite.setPosition(DESIGN_WIDTH - 16, this.sprite.y);
      this.sprite.setVelocity(-vx * 0.75, vy);
    }

    // Stillness check (if stopped moving on a platform or floor)
    if (speedSq < 0.25) {
      this.stillTimer += dt;
      if (this.stillTimer >= 0.8) {
        this.active = false;
      }
    } else {
      this.stillTimer = 0;
    }

    // Out of bounds check
    const x = this.sprite.x;
    const y = this.sprite.y;
    if (x < -100 || x > DESIGN_WIDTH + 100 || y < -150 || y > DESIGN_HEIGHT + 100) {
      this.active = false;
    }
  }

  public destroy(): void {
    this.active = false;
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
