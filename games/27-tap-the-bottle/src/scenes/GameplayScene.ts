import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/Constants';
import { LEVELS } from '../levels';
import { LevelDefinition } from '../levels/types';
import { GeneratedTextures } from '../art/GeneratedTextures';
import { Platform } from '../entities/Platform';
import { Launcher } from '../entities/Launcher';
import { Star } from '../entities/Star';
import { Portal } from '../entities/Portal';
import { Projectile } from '../entities/Projectile';
import { ParticleManager } from '../systems/ParticleManager';
import { AudioManager } from '../systems/AudioManager';
import { Hud } from '../ui/Hud';
import { TutorialHand } from '../ui/TutorialHand';

export class GameplayScene extends Phaser.Scene {
  private levelIndex: number = 0;
  private currentLevel!: LevelDefinition;

  private platforms: Platform[] = [];
  private launchers: Launcher[] = [];
  private stars: Star[] = [];
  private portals: Portal[] = [];
  private projectiles: Projectile[] = [];

  private particleManager!: ParticleManager;
  private hud!: Hud;
  private tutorialHand: TutorialHand | null = null;

  private bgGradient!: Phaser.GameObjects.Graphics;
  private bgPattern!: Phaser.GameObjects.TileSprite;

  private isResolving: boolean = false;
  private remainingStars: number = 0;
  private failureTimer: number = 0;

  constructor() {
    super({ key: 'GameplayScene' });
  }

  init(data: { levelIndex?: number }): void {
    if (typeof data.levelIndex === 'number') {
      this.levelIndex = data.levelIndex;
    } else {
      // Check query param e.g. ?level=2
      const params = new URLSearchParams(window.location.search);
      const qLevel = params.get('level');
      if (qLevel) {
        const lvl = parseInt(qLevel, 10);
        if (!isNaN(lvl) && lvl >= 1 && lvl <= LEVELS.length) {
          this.levelIndex = lvl - 1;
        }
      }
    }
  }

  create(): void {
    // Generate textures if not yet present
    GeneratedTextures.generateAll(this);

    // Matter Physics settings
    this.matter.world.setBounds(0, -200, DESIGN_WIDTH, DESIGN_HEIGHT + 200);
    this.matter.world.setGravity(0, 1.15); // Authentic gravity (~720px/s^2)

    this.particleManager = new ParticleManager(this);

    // Setup Background
    this.createBackground();

    // Load Level
    this.loadLevel(this.levelIndex);

    // Setup Collisions
    this.setupCollisions();

    // Toggle Debug Mode with 'D'
    this.input.keyboard?.on('keydown-D', () => {
      const debugConfig = this.matter.world.drawDebug;
      this.matter.world.drawDebug = !debugConfig;
      this.matter.world.debugGraphic.clear();
    });
  }

  private createBackground(): void {
    this.bgGradient = this.add.graphics().setDepth(0);
    this.bgPattern = this.add.tileSprite(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 'bg_pattern')
      .setDepth(1)
      .setAlpha(0.65);
  }

  private renderBackgroundGradient(theme: 'blue' | 'pink'): void {
    this.bgGradient.clear();
    if (theme === 'blue') {
      this.bgGradient.fillGradientStyle(0x12B9D6, 0x12B9D6, 0x0077D1, 0x0077D1, 1);
    } else {
      this.bgGradient.fillGradientStyle(0xFEE1E4, 0xFEE1E4, 0xFE9ADF, 0xFE9ADF, 1);
    }
    this.bgGradient.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  public loadLevel(index: number): void {
    this.clearLevel();
    this.levelIndex = Phaser.Math.Clamp(index, 0, LEVELS.length - 1);
    this.currentLevel = LEVELS[this.levelIndex];

    this.isResolving = false;
    this.failureTimer = 0;

    // Render theme background
    this.renderBackgroundGradient(this.currentLevel.theme);

    // Platforms
    for (const pConfig of this.currentLevel.platforms) {
      this.platforms.push(new Platform(
        this,
        pConfig.x,
        pConfig.y,
        pConfig.width,
        pConfig.height,
        pConfig.rotation ?? 0,
        pConfig.type ?? (this.currentLevel.theme === 'pink' ? 'blue' : 'wood')
      ));
    }

    // Portals
    if (this.currentLevel.portals) {
      for (const ptConfig of this.currentLevel.portals) {
        this.portals.push(new Portal(
          this,
          ptConfig.id,
          ptConfig.pairId,
          ptConfig.x,
          ptConfig.y,
          ptConfig.rotation ?? 0,
          ptConfig.exitOffsetX ?? 0,
          ptConfig.exitOffsetY ?? 0
        ));
      }
    }

    // Launchers
    for (const lConfig of this.currentLevel.launchers) {
      const launcher = new Launcher(this, lConfig, this.particleManager);
      this.launchers.push(launcher);

      // Connect tap to projectile register
      launcher.sprite.on('pointerdown', () => {
        if (this.isResolving) return;
        const projectile = launcher.activate();
        if (projectile) {
          this.projectiles.push(projectile);
          if (this.tutorialHand) {
            this.tutorialHand.hide();
            this.tutorialHand = null;
          }
        }
      });
    }

    // Stars
    this.remainingStars = this.currentLevel.stars.length;
    for (const sConfig of this.currentLevel.stars) {
      this.stars.push(new Star(this, sConfig.x, sConfig.y));
    }

    // Tutorial Hand for Level 1
    if (this.currentLevel.tutorial && this.launchers.length > 0) {
      const firstLauncher = this.launchers[0];
      this.tutorialHand = new TutorialHand(this, firstLauncher.config.x, firstLauncher.config.y);
    }

    // HUD
    if (!this.hud) {
      this.hud = new Hud(
        this,
        this.currentLevel.id,
        () => this.loadLevel(0), // Home resets to Level 1
        () => this.loadLevel(this.levelIndex) // Restart reloads current level
      );
    } else {
      this.hud.setLevel(this.currentLevel.id);
    }
  }

  private setupCollisions(): void {
    this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Check Projectile + Star
        this.handleStarCollision(bodyA, bodyB);

        // Check Projectile + Platform
        this.handlePlatformBounce(bodyA, bodyB);

        // Check Projectile + Portal
        this.handlePortalCollision(bodyA, bodyB);
      }
    });
  }

  private handleStarCollision(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const isStarA = bodyA.label === 'star';
    const isStarB = bodyB.label === 'star';
    const isProjA = bodyA.label === 'projectile';
    const isProjB = bodyB.label === 'projectile';

    if ((isStarA && isProjB) || (isStarB && isProjA)) {
      const starBody = isStarA ? bodyA : bodyB;
      const starSprite = (starBody as unknown as { gameObject: Phaser.Physics.Matter.Sprite }).gameObject;
      if (!starSprite) return;

      const starEntity = starSprite.getData('entity') as Star;
      if (starEntity && !starEntity.collected) {
        starEntity.collect();
        this.particleManager.emitStarSparkles(starEntity.x, starEntity.y);
        AudioManager.playStarCollect(this.currentLevel.stars.length - this.remainingStars);
        this.remainingStars--;

        if (this.remainingStars === 0 && !this.isResolving) {
          this.triggerLevelComplete();
        }
      }
    }
  }

  private handlePlatformBounce(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const isPlatA = bodyA.label === 'platform';
    const isPlatB = bodyB.label === 'platform';
    const isProjA = bodyA.label === 'projectile';
    const isProjB = bodyB.label === 'projectile';

    if ((isPlatA && isProjB) || (isPlatB && isProjA)) {
      AudioManager.playBounce();
    }
  }

  private handlePortalCollision(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const isPortalA = bodyA.label === 'portal';
    const isPortalB = bodyB.label === 'portal';
    const isProjA = bodyA.label === 'projectile';
    const isProjB = bodyB.label === 'projectile';

    if ((isPortalA && isProjB) || (isPortalB && isProjA)) {
      const portalBody = isPortalA ? bodyA : bodyB;
      const projBody = isProjA ? bodyA : bodyB;

      const portalSprite = (portalBody as unknown as { gameObject: Phaser.Physics.Matter.Sprite }).gameObject;
      const projSprite = (projBody as unknown as { gameObject: Phaser.Physics.Matter.Sprite }).gameObject;

      if (!projSprite || !projSprite.body) return;
      const projectile = projSprite.getData('entity') as Projectile;
      if (!projectile || projectile.portalCooldown > 0) return;

      const portal = this.portals.find(p => p.sensor === portalBody);
      if (!portal) return;

      const targetPortal = this.portals.find(p => p.id === portal.pairId);
      if (!targetPortal) return;

      AudioManager.playPortal();

      // Teleport
      const pBody = projSprite.body as MatterJS.BodyType;
      const vx = pBody.velocity.x;
      const vy = pBody.velocity.y;
      const angV = pBody.angularVelocity;

      this.matter.body.setPosition(pBody, {
        x: targetPortal.x + targetPortal.exitOffsetX,
        y: targetPortal.y + targetPortal.exitOffsetY
      });

      projectile.setVelocity(vx, vy);
      projectile.setAngularVelocity(angV);
      projectile.portalCooldown = 180; // cooldown ms
    }
  }

  private triggerLevelComplete(): void {
    this.isResolving = true;
    AudioManager.playLevelComplete();

    this.time.delayedCall(450, () => {
      this.cameras.main.fade(300, 0, 0, 0, false, (_cam: unknown, progress: number) => {
        if (progress === 1) {
          this.scene.start('CompleteScene', {
            levelIndex: this.levelIndex,
            totalLevels: LEVELS.length
          });
        }
      });
    });
  }

  private triggerLevelFailed(): void {
    this.isResolving = true;
    AudioManager.playLevelFailed();

    this.time.delayedCall(450, () => {
      this.cameras.main.fade(300, 0, 0, 0, false, (_cam: unknown, progress: number) => {
        if (progress === 1) {
          this.scene.start('FailedScene', {
            levelIndex: this.levelIndex
          });
        }
      });
    });
  }

  update(_time: number, delta: number): void {
    this.particleManager.update(delta);

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(delta);
    }

    // Check Level Failed conditions
    if (!this.isResolving && this.remainingStars > 0) {
      const allLaunchersOpened = this.launchers.length > 0 && this.launchers.every(l => l.opened);
      const noActiveProjectiles = this.projectiles.length > 0 && this.projectiles.every(p => !p.active);

      if (allLaunchersOpened && noActiveProjectiles) {
        this.failureTimer += delta;
        if (this.failureTimer > 600) {
          this.triggerLevelFailed();
        }
      } else {
        this.failureTimer = 0;
      }
    }
  }

  private clearLevel(): void {
    this.particleManager?.clear();

    for (const p of this.platforms) p.destroy();
    this.platforms = [];

    for (const l of this.launchers) l.destroy();
    this.launchers = [];

    for (const s of this.stars) s.destroy();
    this.stars = [];

    for (const pt of this.portals) pt.destroy();
    this.portals = [];

    for (const pr of this.projectiles) pr.destroy();
    this.projectiles = [];

    if (this.tutorialHand) {
      this.tutorialHand.destroy();
      this.tutorialHand = null;
    }
  }
}
