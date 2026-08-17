import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
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
    const title = this.add.text(width / 2, height * 0.28, 'ONE-TAP RUNNER', {
      fontSize: '36px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.05, duration: 750, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🏃 Endless Dash & Jump', {
      fontSize: '20px', color: '#e11d48', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0xe11d48).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xfb7185);

    this.add.text(width / 2, height * 0.6, 'RUN NOW', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Tap once to Jump.\nTap in mid-air to Double Jump!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private groundY: number = 0;
  private vy: number = 0;
  private gravity: number = 1600;
  private jumpPower: number = -560;
  private jumpsRemaining: number = 2;
  
  private obstacles: Phaser.GameObjects.Rectangle[] = [];
  private stars: Phaser.GameObjects.Container[] = [];
  
  private distance: number = 0;
  private starsCollected: number = 0;
  private speed: number = 320;
  private isGameOver: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private spawnerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.distance = 0;
    this.starsCollected = 0;
    this.speed = 320;
    this.isGameOver = false;
    this.vy = 0;
    this.jumpsRemaining = 2;
    this.obstacles = [];
    this.stars = [];

    const { width, height } = this.scale;
    this.groundY = height - 120;

    // Ground & Backdrop (Warm Slate Ground with Vibrant Stripe)
    this.add.rectangle(width / 2, height - 60, width, 120, 0x334155);
    this.add.rectangle(width / 2, this.groundY, width, 4, 0xe11d48);

    // Player (Cute coral runner block)
    this.player = this.add.rectangle(80, this.groundY - 24, 40, 48, 0xe11d48).setStrokeStyle(3, 0xffffff);

    // UI Header
    this.scoreText = this.add.text(24, 24, '0m  •  ⭐ 0', { fontSize: '20px', fontStyle: 'bold', color: '#0f172a' });

    // Tap Input (Jump / Double Jump)
    this.input.on('pointerdown', () => this.jump());

    // Spawner
    this.spawnerEvent = this.time.addEvent({
      delay: 1200,
      callback: this.spawnObstacleWave,
      callbackScope: this,
      loop: true,
    });

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private jump() {
    if (this.isGameOver) return;
    if (this.jumpsRemaining > 0) {
      this.jumpsRemaining--;
      this.vy = this.jumpPower;
      SoundFx.playJump();
      GameBridge.haptic('light');

      // Squash and stretch
      this.tweens.add({
        targets: this.player,
        scaleX: 0.8,
        scaleY: 1.25,
        duration: 80,
        yoyo: true,
      });
    }
  }

  private spawnObstacleWave() {
    if (this.isGameOver) return;
    const { width } = this.scale;

    // Obstacle (Spike / Rock)
    const obsHeight = Phaser.Math.Between(36, 60);
    const obs = this.add.rectangle(width + 40, this.groundY - obsHeight / 2, 32, obsHeight, 0xef4444)
      .setStrokeStyle(2, 0xffffff);
    this.obstacles.push(obs);

    // Floating Star Bonus
    if (Math.random() < 0.6) {
      const starY = this.groundY - obsHeight - Phaser.Math.Between(40, 90);
      const starIcon = this.add.text(0, 0, '⭐', { fontSize: '24px' }).setOrigin(0.5);
      const star = this.add.container(width + 40, starY, [starIcon]);
      this.stars.push(star);
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;
    const dt = delta / 1000;

    // Distance and speed
    this.distance += Math.floor(this.speed * dt * 0.1);
    this.speed = Math.min(320 + this.distance * 0.4, 680);
    this.scoreText.setText(`${this.distance}m  •  ⭐ ${this.starsCollected}`);

    // Player Physics
    this.vy += this.gravity * dt;
    this.player.y += this.vy * dt;

    if (this.player.y >= this.groundY - 24) {
      this.player.y = this.groundY - 24;
      this.vy = 0;
      this.jumpsRemaining = 2; // Reset jumps on ground
    }

    // Move Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed * dt;

      // Check collision with player
      if (Math.abs(obs.x - this.player.x) < 32 && Math.abs(obs.y - this.player.y) < (obs.height + 48) / 2 - 6) {
        this.endGame();
        return;
      }

      if (obs.x < -60) {
        obs.destroy();
        this.obstacles.splice(i, 1);
      }
    }

    // Move Stars
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];
      star.x -= this.speed * dt;

      if (Math.abs(star.x - this.player.x) < 36 && Math.abs(star.y - this.player.y) < 44) {
        SoundFx.playScore();
        GameBridge.haptic('light');
        this.starsCollected++;
        star.destroy();
        this.stars.splice(i, 1);
        continue;
      }

      if (star.x < -60) {
        star.destroy();
        this.stars.splice(i, 1);
      }
    }
  }

  private endGame() {
    this.isGameOver = true;
    this.spawnerEvent.remove();
    SoundFx.playHit();
    SoundFx.playGameOver();
    GameBridge.haptic('heavy');
    this.cameras.main.shake(250, 0.02);

    const total = this.distance + this.starsCollected * 50;

    GameBridge.gameOver({
      score: total,
      stats: { distanceMeters: this.distance, stars: this.starsCollected },
    });

    this.time.delayedCall(600, () => {
      this.scene.start('GameOverScene', { score: total, distance: this.distance });
    });
  }
}

class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  private distance: number = 0;

  constructor() { super({ key: 'GameOverScene' }); }
  init(data: any) {
    this.score = data.score || 0;
    this.distance = data.distance || 0;
  }

  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height * 0.28, 'WIPEOUT!', { fontSize: '42px', fontStyle: 'bold', color: '#dc2626' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.38, `DISTANCE: ${this.distance}m`, { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.46, `${this.score} PTS`, { fontSize: '50px', fontStyle: 'bold', color: '#e11d48' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0xe11d48).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xfb7185);
    this.add.text(width / 2, height * 0.65, 'RUN AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1500 },
      debug: false,
      fps: 60,
      fixedStep: true,
    },
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
