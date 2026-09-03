import Phaser from 'phaser';
import { COLLISION_CATEGORIES, BASE_LAUNCH_SPEED } from '../config/Constants';
import { LauncherConfig } from '../levels/types';
import { Projectile } from './Projectile';
import { ParticleManager } from '../systems/ParticleManager';
import { AudioManager } from '../systems/AudioManager';

export class Launcher {
  public config: LauncherConfig;
  public opened: boolean = false;
  public sprite: Phaser.Physics.Matter.Sprite;
  public onLaunch?: (projectile: Projectile) => void;
  private scene: Phaser.Scene;
  private particleManager: ParticleManager;
  private sealedKey: string;
  private openedKey: string;

  constructor(scene: Phaser.Scene, config: LauncherConfig, particleManager: ParticleManager) {
    this.scene = scene;
    this.config = config;
    this.particleManager = particleManager;

    if (config.type === 'bottle') {
      this.sealedKey = `bottle_${config.color}_sealed`;
      this.openedKey = `bottle_${config.color}_opened`;
    } else {
      this.sealedKey = 'can_red_sealed';
      this.openedKey = 'can_red_opened';
    }

    const rad = Phaser.Math.DegToRad(config.rotation || 0);
    const scale = config.scale || 0.82;

    const width = (config.type === 'bottle' ? 44 : 54) * scale;
    const height = (config.type === 'bottle' ? 140 : 96) * scale;

    this.sprite = scene.matter.add.sprite(config.x, config.y, this.sealedKey, undefined, {
      label: 'launcher',
      isStatic: config.isStatic ?? false,
      friction: 0.45,
      frictionAir: 0.02,
      restitution: 0.10,
      density: 0.003,
      chamfer: { radius: 6 },
      collisionFilter: {
        category: COLLISION_CATEGORIES.LAUNCHER,
        mask: COLLISION_CATEGORIES.PLATFORM | COLLISION_CATEGORIES.PROJECTILE | COLLISION_CATEGORIES.LAUNCHER
      }
    });

    this.sprite.setDisplaySize(
      (config.type === 'bottle' ? 96 : 90) * scale,
      (config.type === 'bottle' ? 210 : 140) * scale
    );

    this.sprite.setRotation(rad);
    this.sprite.setDepth(9);
    this.sprite.setData('entity', this);

    // Interactive pointer handling with generous hit area
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      this.activate();
    });
  }

  public activate(): Projectile | null {
    if (this.opened) return null;
    this.opened = true;

    AudioManager.playPop();

    // Visual squash and swap to opened shocked expression
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: (this.config.scale || 0.82) * 1.08,
      scaleY: (this.config.scale || 0.82) * 0.90,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeInOut',
      onYoyo: () => {
        this.sprite.setTexture(this.openedKey);
      }
    });

    // Launch position near top mouth of bottle/can
    const rot = this.sprite.rotation;
    const offsetDist = this.config.type === 'bottle' ? 70 : 42;
    const launchX = this.sprite.x + Math.sin(rot) * offsetDist;
    const launchY = this.sprite.y - Math.cos(rot) * offsetDist;

    // Launch direction vector
    const launchAngleRad = Phaser.Math.DegToRad(this.config.launchAngle);
    const speed = this.config.launchSpeed ?? BASE_LAUNCH_SPEED;
    const dirX = Math.cos(launchAngleRad);
    const dirY = Math.sin(launchAngleRad);

    const projectileType = this.config.projectileType || (this.config.type === 'bottle' ? 'crownCap' : 'canTab');
    const projectile = new Projectile(
      this.scene,
      launchX,
      launchY,
      projectileType,
      this.config.color,
      this.particleManager
    );

    projectile.setVelocity(dirX * speed, dirY * speed);
    projectile.setAngularVelocity(this.config.projectileAngularVelocity ?? (Math.random() - 0.5) * 0.35);

    // Subtle recoil to container
    if (!this.config.isStatic && this.sprite.body) {
      const recoilStr = this.config.recoilStrength ?? 0.0035;
      this.scene.matter.body.applyForce(this.sprite.body as MatterJS.BodyType, { x: this.sprite.x, y: this.sprite.y }, {
        x: -dirX * recoilStr,
        y: -dirY * recoilStr
      });
    }

    // Launch pop bubbles burst
    for (let i = 0; i < 5; i++) {
      this.particleManager.emitBubble(launchX, launchY, this.config.color, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    }

    if (this.onLaunch) {
      this.onLaunch(projectile);
    }

    return projectile;
  }

  public destroy(): void {
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
