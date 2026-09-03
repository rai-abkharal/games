import Phaser from 'phaser';
import { COLLISION_CATEGORIES, DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/Constants';
import { ParticleManager } from '../systems/ParticleManager';

export class Projectile {
  public sprite: Phaser.Physics.Matter.Sprite;
  public color: string;
  public type: 'crownCap' | 'canTab';
  public active: boolean = true;
  public portalCooldown: number = 0;
  private particleManager: ParticleManager;
  private bubbleTimer: number = 0;
  private stillTimer: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: 'crownCap' | 'canTab',
    color: string,
    particleManager: ParticleManager
  ) {
    this.type = type;
    this.color = color;
    this.particleManager = particleManager;

    const textureKey = type === 'crownCap' ? 'crown_cap' : 'can_tab';

    this.sprite = scene.matter.add.sprite(x, y, textureKey, undefined, {
      label: 'projectile',
      friction: 0.12,
      frictionAir: 0.008,
      restitution: 0.42,
      density: 0.001,
      chamfer: { radius: 6 },
      collisionFilter: {
        category: COLLISION_CATEGORIES.PROJECTILE,
        mask: COLLISION_CATEGORIES.PLATFORM | COLLISION_CATEGORIES.STAR | COLLISION_CATEGORIES.PORTAL | COLLISION_CATEGORIES.LAUNCHER
      }
    });

    this.sprite.setDepth(10);
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

    const dt = delta / 1000;
    if (this.portalCooldown > 0) {
      this.portalCooldown -= delta;
    }

    const vx = this.sprite.body.velocity.x;
    const vy = this.sprite.body.velocity.y;
    const speedSq = vx * vx + vy * vy;

    // Emit bubble trail while in flight
    this.bubbleTimer += delta;
    if (this.bubbleTimer >= 22 && speedSq > 4) {
      this.bubbleTimer = 0;
      this.particleManager.emitBubble(this.sprite.x, this.sprite.y, this.color, -vx * 0.1, -vy * 0.1);
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
