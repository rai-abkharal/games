import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

interface TargetItem {
  sprite: Phaser.GameObjects.Sprite;
  speed: number;
  dir: number;
  radius: number;
  pts: number;
}

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  preload() {
    const gfx = this.make.graphics({ x: 0, y: 0 });

    // Arrow texture
    gfx.fillStyle(0xd97706, 1);
    gfx.fillRect(0, 4, 36, 4);
    gfx.fillStyle(0xef4444, 1);
    gfx.fillTriangle(36, 0, 48, 6, 36, 12);
    gfx.fillStyle(0x334155, 1);
    gfx.fillTriangle(0, 0, 8, 6, 0, 12);
    gfx.generateTexture('arrow', 48, 12);
    gfx.clear();

    // Target texture
    gfx.fillStyle(0xef4444, 1);
    gfx.fillCircle(24, 24, 24);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(24, 24, 16);
    gfx.fillStyle(0xef4444, 1);
    gfx.fillCircle(24, 24, 8);
    gfx.fillStyle(0xfacc15, 1);
    gfx.fillCircle(24, 24, 3);
    gfx.generateTexture('bullseye', 48, 48);
    gfx.clear();
  }
  create() {
    GameBridge.ready();
    GameBridge.gameStarted();
    this.scene.start('GameScene');
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }
  create() {
    const { width, height } = this.scale;
    const title = this.add.text(width / 2, height * 0.28, 'TINY ARCHER', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.05, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🏹 Precision Bow Shooting', {
      fontSize: '20px', color: '#059669', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x059669).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x34d399);

    this.add.text(width / 2, height * 0.6, 'DRAW BOW', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Drag back from bow at bottom to aim.\nRelease to shoot at moving targets!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private bowOrigin!: Phaser.Math.Vector2;
  private isAiming: boolean = false;
  private aimVector!: Phaser.Math.Vector2;
  private trajectoryDots: Phaser.GameObjects.Circle[] = [];
  
  private arrowsLeft: number = 10;
  private score: number = 0;
  private isGameOver: boolean = false;
  
  private activeArrows: Phaser.GameObjects.Sprite[] = [];
  private targets: TargetItem[] = [];
  
  private arrowsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private spawnerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.arrowsLeft = 10;
    this.score = 0;
    this.isGameOver = false;
    this.activeArrows = [];
    this.targets = [];
    this.isAiming = false;

    const { width, height } = this.scale;
    this.bowOrigin = new Phaser.Math.Vector2(width / 2, height - 90);
    this.aimVector = new Phaser.Math.Vector2();

    // UI Header
    this.scoreText = this.add.text(24, 24, 'SCORE: 0', { fontSize: '20px', fontStyle: 'bold', color: '#0f172a' });
    this.arrowsText = this.add.text(width - 24, 24, '🏹 10', { fontSize: '22px', fontStyle: 'bold', color: '#d97706' }).setOrigin(1, 0);

    // Bow Base
    this.add.circle(this.bowOrigin.x, this.bowOrigin.y, 24, 0x059669).setStrokeStyle(3, 0x34d399);

    // Trajectory Dots
    this.trajectoryDots = [];
    for (let i = 0; i < 10; i++) {
      const dot = this.add.circle(0, 0, 4, 0x059669, 0.7).setVisible(false);
      this.trajectoryDots.push(dot);
    }

    // Input handlers
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver || this.arrowsLeft <= 0) return;
      this.isAiming = true;
      this.updateAim(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isAiming) {
        this.updateAim(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isAiming) {
        this.isAiming = false;
        this.trajectoryDots.forEach((d) => d.setVisible(false));
        this.releaseArrow(pointer);
      }
    });

    // Spawn targets
    this.spawnerEvent = this.time.addEvent({
      delay: 1100,
      callback: this.spawnTarget,
      callbackScope: this,
      loop: true,
    });

    this.spawnTarget();
    this.spawnTarget();

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private updateAim(pointer: Phaser.Input.Pointer) {
    const pullVector = new Phaser.Math.Vector2(this.bowOrigin.x - pointer.x, this.bowOrigin.y - pointer.y);
    const maxPull = 120;
    if (pullVector.length() > maxPull) {
      pullVector.setLength(maxPull);
    }

    this.aimVector = pullVector;

    // Draw trajectory dots
    const speed = this.aimVector.length() * 8.5;
    const angle = this.aimVector.angle();
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.trajectoryDots.forEach((dot, idx) => {
      const t = (idx + 1) * 0.04;
      const x = this.bowOrigin.x + vx * t;
      const y = this.bowOrigin.y + vy * t + 0.5 * 200 * t * t;
      dot.setPosition(x, y);
      dot.setVisible(true);
    });
  }

  private releaseArrow(_pointer: Phaser.Input.Pointer) {
    if (this.aimVector.length() < 15) return;

    this.arrowsLeft--;
    this.arrowsText.setText(`🏹 ${this.arrowsLeft}`);
    SoundFx.playShoot();
    GameBridge.haptic('light');

    const arrow = this.add.sprite(this.bowOrigin.x, this.bowOrigin.y, 'arrow');
    this.activeArrows.push(arrow);

    const speed = this.aimVector.length() * 8.5;
    const angle = this.aimVector.angle();
    (arrow as any).vx = Math.cos(angle) * speed;
    (arrow as any).vy = Math.sin(angle) * speed;
    arrow.setRotation(angle);

    this.aimVector.reset();
  }

  private spawnTarget() {
    if (this.isGameOver) return;
    const { width } = this.scale;
    const y = Phaser.Math.Between(100, 380);
    const startFromLeft = Math.random() < 0.5;
    const x = startFromLeft ? -30 : width + 30;
    const dir = startFromLeft ? 1 : -1;
    const speed = Phaser.Math.Between(80, 160);

    const sprite = this.add.sprite(x, y, 'bullseye');
    this.targets.push({ sprite, speed, dir, radius: 24, pts: 150 });
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;
    const dt = delta / 1000;
    const { width, height } = this.scale;

    // Move active arrows
    for (let i = this.activeArrows.length - 1; i >= 0; i--) {
      const arrow = this.activeArrows[i];
      arrow.x += (arrow as any).vx * dt;
      arrow.y += (arrow as any).vy * dt;
      (arrow as any).vy += 180 * dt; // gravity
      arrow.setRotation(Math.atan2((arrow as any).vy, (arrow as any).vx));

      // Target collisions
      for (let j = this.targets.length - 1; j >= 0; j--) {
        const target = this.targets[j];
        const dist = Phaser.Math.Distance.Between(arrow.x, arrow.y, target.sprite.x, target.sprite.y);
        if (dist < target.radius) {
          // HIT!
          SoundFx.playHit();
          SoundFx.playScore();
          GameBridge.haptic('medium');

          const earned = dist < 8 ? target.pts * 2 : target.pts; // Bullseye bonus
          this.score += earned;
          this.scoreText.setText(`SCORE: ${this.score}`);

          const popup = this.add.text(target.sprite.x, target.sprite.y, `+${earned}`, {
            fontSize: '20px', fontStyle: 'bold', color: '#d97706',
          }).setOrigin(0.5);
          this.tweens.add({ targets: popup, y: popup.y - 30, alpha: 0, duration: 600, onComplete: () => popup.destroy() });

          target.sprite.destroy();
          this.targets.splice(j, 1);
          arrow.destroy();
          this.activeArrows.splice(i, 1);
          break;
        }
      }

      if (arrow.y > height + 50 || arrow.x < -50 || arrow.x > width + 50) {
        arrow.destroy();
        this.activeArrows.splice(i, 1);

        if (this.arrowsLeft === 0 && this.activeArrows.length === 0) {
          this.endGame();
        }
      }
    }

    // Move targets
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];
      target.sprite.x += target.speed * target.dir * dt;
      if ((target.dir === 1 && target.sprite.x > width + 50) || (target.dir === -1 && target.sprite.x < -50)) {
        target.sprite.destroy();
        this.targets.splice(i, 1);
      }
    }

    if (this.arrowsLeft === 0 && this.activeArrows.length === 0 && !this.isGameOver) {
      this.time.delayedCall(400, () => this.endGame());
    }
  }

  private endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.spawnerEvent.remove();
    SoundFx.playGameOver();

    GameBridge.gameOver({
      score: this.score,
      stats: { finalScore: this.score },
    });

    this.scene.start('GameOverScene', { score: this.score });
  }
}

class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  constructor() { super({ key: 'GameOverScene' }); }
  init(data: any) { this.score = data.score || 0; }
  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height * 0.28, 'QUIVER EMPTY!', { fontSize: '38px', fontStyle: 'bold', color: '#059669' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.40, 'ACCURACY SCORE', { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, `${this.score} PTS`, { fontSize: '52px', fontStyle: 'bold', color: '#d97706' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x059669).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x34d399);
    this.add.text(width / 2, height * 0.65, 'SHOOT AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    const restart = () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    };
    btn.on('pointerdown', restart);
    GameBridge.onRestart(restart);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: 480,
  height: 800,
  backgroundColor: '#f8f6f0',
  transparent: false,
  roundPixels: true,
  antialias: false,
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false,
    deltaHistory: 10,
    smoothStep: true,
  },
  render: {
    powerPreference: 'high-performance',
    desynchronized: true,
    batchSize: 2048,
    clearBeforeRender: true,
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
