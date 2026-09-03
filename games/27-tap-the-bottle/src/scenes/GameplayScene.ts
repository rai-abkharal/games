import Phaser from 'phaser';
import { getLevel, LevelDefinition, MAX_LEVELS } from '../levels';
import { Launcher } from '../entities/Launcher';
import { Platform } from '../entities/Platform';
import { Star } from '../entities/Star';
import { Portal } from '../entities/Portal';
import { Projectile } from '../entities/Projectile';
import { ParticleManager } from '../systems/ParticleManager';
import { AudioManager } from '../systems/AudioManager';
import { Hud } from '../ui/Hud';
import { TutorialHand } from '../ui/TutorialHand';
import { createSceneBackground } from '../ui/SceneBackground';
import { GameBridge } from '../../../shared/GameBridge';

interface GameplayData {
  level?: number;
}

export class GameplayScene extends Phaser.Scene {
  private currentLevel: number = 1;
  private levelDef!: LevelDefinition;
  private particleManager!: ParticleManager;
  private hud!: Hud;
  private tutorialHand: TutorialHand | null = null;
  private launchers: Launcher[] = [];
  private platforms: Platform[] = [];
  private stars: Star[] = [];
  private portals: Portal[] = [];
  private projectiles: Projectile[] = [];

  private remainingStars: number = 0;
  private collectedStarsCount: number = 0;
  private isLevelWon: boolean = false;
  private isLevelFailed: boolean = false;
  private failTimer: number = 0;
  private elapsedMs: number = 0;

  private readonly handleSoundChange = (enabled: boolean): void => {
    AudioManager.enabled = enabled;
  };

  private readonly restartCurrentLevel = (): void => {
    this.scene.restart({ level: this.currentLevel });
  };

  private readonly handleCollisionStart = (event: Phaser.Physics.Matter.Events.CollisionStartEvent): void => {
    for (const pair of event.pairs) {
      this.handleCollision(pair.bodyA as MatterJS.BodyType, pair.bodyB as MatterJS.BodyType);
    }
  };

  constructor() {
    super('GameplayScene');
  }

  init(data: GameplayData): void {
    this.currentLevel = Phaser.Math.Clamp(data.level || 1, 1, MAX_LEVELS);
    this.launchers = [];
    this.platforms = [];
    this.stars = [];
    this.portals = [];
    this.projectiles = [];
    this.remainingStars = 0;
    this.collectedStarsCount = 0;
    this.isLevelWon = false;
    this.isLevelFailed = false;
    this.failTimer = 0;
    this.elapsedMs = 0;
    this.tutorialHand = null;
  }

  create(): void {
    AudioManager.unlock();
    this.levelDef = getLevel(this.currentLevel);
    GameBridge.gameStarted();
    GameBridge.onRestart(this.restartCurrentLevel);
    GameBridge.onSoundChange(this.handleSoundChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    // 1-2. Full-height background and bottle pattern.
    createSceneBackground(this, this.levelDef.theme);

    // 3. Systems & HUD
    this.particleManager = new ParticleManager(this);

    this.hud = new Hud(
      this,
      this.currentLevel,
      () => {
        // Home button: restart level 1
        this.scene.start('GameplayScene', { level: 1 });
      },
      () => {
        // Restart button: instant clean reload of current level
        this.scene.start('GameplayScene', { level: this.currentLevel });
      }
    );

    // 4. Build Platforms
    for (const pConfig of this.levelDef.platforms) {
      const platform = new Platform(
        this,
        pConfig.x,
        pConfig.y,
        pConfig.width,
        pConfig.height,
        pConfig.rotation ?? 0,
        pConfig.type ?? 'wood'
      );
      this.platforms.push(platform);
    }

    // 5. Build Portals
    if (this.levelDef.portals) {
      for (const portConfig of this.levelDef.portals) {
        const portal = new Portal(
          this,
          portConfig.id,
          portConfig.pairId,
          portConfig.x,
          portConfig.y,
          portConfig.rotation ?? 0,
          portConfig.exitOffsetX ?? 0,
          portConfig.exitOffsetY ?? 0
        );
        this.portals.push(portal);
      }
    }

    // 6. Build Stars
    this.remainingStars = this.levelDef.stars.length;
    for (const sConfig of this.levelDef.stars) {
      const star = new Star(this, sConfig.x, sConfig.y);
      this.stars.push(star);
    }

    // 7. Build Launchers (Bottles & Cans)
    for (const lConfig of this.levelDef.launchers) {
      const launcher = new Launcher(this, lConfig, this.particleManager);
      launcher.onLaunch = (projectile: Projectile) => {
        this.projectiles.push(projectile);
        if (this.tutorialHand) {
          this.tutorialHand.hide();
          this.tutorialHand = null;
        }
      };
      this.launchers.push(launcher);
    }

    // 8. Tutorial Glove (Level 1 only)
    if (this.levelDef.tutorial && this.launchers.length > 0) {
      const firstLauncher = this.launchers[0];
      this.tutorialHand = new TutorialHand(this, firstLauncher.config.x, firstLauncher.config.y);
    }

    // 9. Physics Collisions
    this.matter.world.on('collisionstart', this.handleCollisionStart);

    // 10. Debug Mode key
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-D', () => {
        this.matter.world.drawDebug = !this.matter.world.drawDebug;
        if (!this.matter.world.debugGraphic) {
          this.matter.world.createDebugGraphic();
        }
        this.matter.world.debugGraphic.setVisible(this.matter.world.drawDebug);
      });
    }

    // Unlock WebAudio on screen touch
    this.input.on('pointerdown', () => {
      AudioManager.unlock();
    });
  }

  private handleCollision(bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const projectileBody = bodyA.label === 'projectile' ? bodyA : (bodyB.label === 'projectile' ? bodyB : null);
    const otherBody = projectileBody === bodyA ? bodyB : bodyA;

    if (!projectileBody) return;

    const projectile: Projectile | undefined = (projectileBody as any).projectileEntity || (projectileBody.gameObject?.getData('entity'));

    // A. Projectile vs Star
    if (otherBody.label === 'star') {
      const star: Star | undefined = (otherBody as any).starEntity || (otherBody.gameObject?.getData('entity'));
      if (star && !star.collected) {
        this.collectStar(star);
      }
      return;
    }

    // B. Projectile vs Platform
    if (otherBody.label === 'platform') {
      AudioManager.playBounce();
      return;
    }

    // C. Projectile vs Portal
    if (otherBody.label === 'portal' && projectile && projectile.portalCooldown <= 0) {
      const currentPortal: Portal | undefined = (otherBody as any).portalEntity;
      if (currentPortal) {
        const destPortal = this.portals.find(p => p.id === currentPortal.pairId);
        if (destPortal && projectile.sprite.body) {
          const body = projectile.sprite.body as MatterJS.BodyType;
          AudioManager.playPortal();
          projectile.portalCooldown = 320;

          // Compute exit velocity preserving speed
          const vx = body.velocity.x;
          const vy = body.velocity.y;
          const curSpeed = Math.sqrt(vx * vx + vy * vy);
          const speed = Math.max(24, curSpeed || 24);

          // Teleport to destination portal
          const destRotRad = Phaser.Math.DegToRad(destPortal.rotation);
          const exitAngle = destRotRad - Math.PI / 2; // outward direction
          const exitX = destPortal.x + Math.cos(exitAngle) * 35;
          const exitY = destPortal.y + Math.sin(exitAngle) * 35;

          this.matter.body.setPosition(body, { x: exitX, y: exitY });
          this.matter.body.setVelocity(body, {
            x: Math.cos(exitAngle) * speed,
            y: Math.sin(exitAngle) * speed
          });
        }
      }
      return;
    }
  }

  private collectStar(star: Star): void {
    if (star.collected) return;
    star.collect();
    AudioManager.playStarCollect(this.collectedStarsCount++);
    GameBridge.haptic('light');
    this.particleManager.emitStarSparkles(star.x, star.y);
    this.remainingStars--;

    if (this.remainingStars <= 0 && !this.isLevelWon) {
      this.isLevelWon = true;
      const score = this.currentLevel * 1000 + this.collectedStarsCount * 100;
      const nextUnlockedLevel = Math.min(MAX_LEVELS, this.currentLevel + 1);
      localStorage.setItem('tap-the-bottle-unlocked-level', String(nextUnlockedLevel));

      GameBridge.haptic('success');
      GameBridge.completed({
        score,
        level: this.currentLevel,
        stats: {
          stars: this.collectedStarsCount,
          timeSpentSeconds: Math.max(1, Math.round(this.elapsedMs / 1000))
        }
      });

      this.time.delayedCall(650, () => {
        this.scene.start('CompleteScene', {
          level: this.currentLevel,
          theme: this.levelDef.theme
        });
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.isLevelWon && !this.isLevelFailed) {
      this.elapsedMs += delta;
    }
    this.particleManager.update(delta);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(delta);
    }

    // Continuous swept star collection check so fast caps NEVER tunnel or miss
    if (!this.isLevelWon) {
      for (const star of this.stars) {
        if (star.collected) continue;
        for (const proj of this.projectiles) {
          if (!proj.sprite || !proj.sprite.body || !proj.active) continue;
          const px = proj.prevX;
          const py = proj.prevY;
          const cx = proj.sprite.x;
          const cy = proj.sprite.y;

          const l2 = (cx - px) ** 2 + (cy - py) ** 2;
          let dist = 0;
          if (l2 === 0) {
            dist = Phaser.Math.Distance.Between(star.x, star.y, cx, cy);
          } else {
            const t = Phaser.Math.Clamp(((star.x - px) * (cx - px) + (star.y - py) * (cy - py)) / l2, 0, 1);
            const projX = px + t * (cx - px);
            const projY = py + t * (cy - py);
            dist = Phaser.Math.Distance.Between(star.x, star.y, projX, projY);
          }

          if (dist <= 36) {
            this.collectStar(star);
            break;
          }
        }
      }
    }

    // Level failure evaluation
    if (!this.isLevelWon && !this.isLevelFailed && this.remainingStars > 0) {
      const allLaunchersOpened = this.launchers.length > 0 && this.launchers.every(l => l.opened);
      const allProjectilesSettled = this.projectiles.length > 0 && this.projectiles.every(p => !p.active);

      if (allLaunchersOpened && allProjectilesSettled) {
        this.failTimer += delta;
        if (this.failTimer >= 850) {
          this.isLevelFailed = true;
          const score = (this.currentLevel - 1) * 1000 + this.collectedStarsCount * 100;
          GameBridge.haptic('error');
          GameBridge.gameOver({
            score,
            level: this.currentLevel,
            timeSpentSeconds: Math.max(1, Math.round(this.elapsedMs / 1000)),
            stats: {
              stars: this.collectedStarsCount,
              missedStars: this.remainingStars
            }
          });
          this.scene.start('FailedScene', {
            level: this.currentLevel,
            theme: this.levelDef.theme
          });
        }
      } else {
        this.failTimer = 0;
      }
    }
  }

  shutdown(): void {
    GameBridge.offRestart(this.restartCurrentLevel);
    GameBridge.offSoundChange(this.handleSoundChange);
    this.particleManager?.clear();

    // Phaser tears down the Matter world and display list before this callback
    // completes. Do not remove bodies here: on mobile that race stopped the
    // render loop between Gameplay and Complete/Failed scenes.
    this.projectiles = [];
    this.launchers = [];
    this.platforms = [];
    this.stars = [];
    this.portals = [];
    this.tutorialHand = null;
  }
}
