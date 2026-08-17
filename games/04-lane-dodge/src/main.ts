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
    const title = this.add.text(width / 2, height * 0.28, 'LANE DODGE', {
      fontSize: '40px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.05, duration: 700, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🏎️ 3-Lane Survival Rush', {
      fontSize: '20px', color: '#d97706', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x2563eb).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x60a5fa);

    this.add.text(width / 2, height * 0.6, 'DRIVE NOW', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Tap Left / Right half of screen\nto shift lanes and dodge hazards!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private playerLane: number = 1; // 0: Left, 1: Center, 2: Right
  private laneX: number[] = [];
  private player!: Phaser.GameObjects.Container;
  private obstacles: Phaser.GameObjects.Container[] = [];
  private coins: Phaser.GameObjects.Container[] = [];
  private roadDashes: Phaser.GameObjects.Rectangle[] = [];
  
  private score: number = 0;
  private distance: number = 0;
  private gameSpeed: number = 380;
  private isGameOver: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private spawnTimer!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    this.distance = 0;
    this.gameSpeed = 380;
    this.playerLane = 1;
    this.isGameOver = false;
    this.obstacles = [];
    this.coins = [];
    this.roadDashes = [];

    const { width, height } = this.scale;
    const laneWidth = width / 3;
    this.laneX = [laneWidth * 0.5, laneWidth * 1.5, laneWidth * 2.5];

    // Road surface backdrop
    this.add.rectangle(width / 2, height / 2, width, height, 0xede8e1);

    // Road dividers
    [laneWidth, laneWidth * 2].forEach((x) => {
      for (let y = 0; y < height; y += 60) {
        const dash = this.add.rectangle(x, y, 6, 32, 0xffffff);
        this.roadDashes.push(dash);
      }
    });

    // Player Car Container
    const carBody = this.add.rectangle(0, 0, 48, 80, 0x2563eb).setStrokeStyle(2, 0xffffff);
    const carWindow = this.add.rectangle(0, -10, 36, 24, 0x1e3a8a);
    const carLightL = this.add.circle(-16, -36, 4, 0xfacc15);
    const carLightR = this.add.circle(16, -36, 4, 0xfacc15);

    this.player = this.add.container(this.laneX[1], height - 120, [carBody, carWindow, carLightL, carLightR]);

    // UI Header
    this.scoreText = this.add.text(24, 24, 'COINS: 0', { fontSize: '20px', fontStyle: 'bold', color: '#d97706' });
    this.distText = this.add.text(width - 24, 24, '0m', { fontSize: '20px', fontStyle: 'bold', color: '#2563eb' }).setOrigin(1, 0);

    // Controls: Tap Left half to move left, Tap Right half to move right
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      if (pointer.x < width / 2) {
        this.shiftLane(-1);
      } else {
        this.shiftLane(1);
      }
    });

    // Spawner
    this.spawnTimer = this.time.addEvent({
      delay: 750,
      callback: this.spawnHazards,
      callbackScope: this,
      loop: true,
    });

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private shiftLane(dir: number) {
    const nextLane = Phaser.Math.Clamp(this.playerLane + dir, 0, 2);
    if (nextLane !== this.playerLane) {
      this.playerLane = nextLane;
      SoundFx.playTap();
      GameBridge.haptic('light');

      this.tweens.add({
        targets: this.player,
        x: this.laneX[this.playerLane],
        duration: 120,
        ease: 'Quad.easeOut',
      });
    }
  }

  private spawnHazards() {
    if (this.isGameOver) return;

    const freeLane = Phaser.Math.Between(0, 2);
    const lanes = [0, 1, 2].filter((l) => l !== freeLane);

    lanes.forEach((lane) => {
      if (Math.random() < 0.75) {
        // Hazard Block
        const obsBody = this.add.rectangle(0, 0, 52, 70, 0xef4444).setStrokeStyle(2, 0xffffff);
        const obsMark = this.add.text(0, 0, '⚠️', { fontSize: '24px' }).setOrigin(0.5);
        const obs = this.add.container(this.laneX[lane], -80, [obsBody, obsMark]);
        this.obstacles.push(obs);
      }
    });

    // Spawn coin in free lane occasionally
    if (Math.random() < 0.5) {
      const coinCircle = this.add.circle(0, 0, 16, 0xfacc15).setStrokeStyle(2, 0xffffff);
      const coinTxt = this.add.text(0, 0, '$', { fontSize: '18px', fontStyle: 'bold', color: '#78350f' }).setOrigin(0.5);
      const coin = this.add.container(this.laneX[freeLane], -80, [coinCircle, coinTxt]);
      this.coins.push(coin);
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

    const dt = delta / 1000;
    const { height } = this.scale;

    // Distance & speed progression
    this.distance += Math.floor(this.gameSpeed * dt * 0.1);
    this.distText.setText(`${this.distance}m`);
    this.gameSpeed = Math.min(380 + this.distance * 0.4, 750);

    // Scroll road dashes
    this.roadDashes.forEach((dash) => {
      dash.y += this.gameSpeed * dt;
      if (dash.y > height + 20) {
        dash.y = -20;
      }
    });

    // Move Obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.y += this.gameSpeed * dt;

      // Collision with player
      if (Math.abs(obs.x - this.player.x) < 40 && Math.abs(obs.y - this.player.y) < 60) {
        this.endGame();
        return;
      }

      if (obs.y > height + 100) {
        obs.destroy();
        this.obstacles.splice(i, 1);
      }
    }

    // Move Coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.y += this.gameSpeed * dt;

      // Pickup coin
      if (Math.abs(coin.x - this.player.x) < 40 && Math.abs(coin.y - this.player.y) < 50) {
        SoundFx.playScore();
        GameBridge.haptic('light');
        this.score += 10;
        this.scoreText.setText(`COINS: ${this.score}`);
        coin.destroy();
        this.coins.splice(i, 1);
        continue;
      }

      if (coin.y > height + 100) {
        coin.destroy();
        this.coins.splice(i, 1);
      }
    }
  }

  private endGame() {
    this.isGameOver = true;
    this.spawnTimer.remove();
    SoundFx.playHit();
    SoundFx.playGameOver();
    GameBridge.haptic('heavy');
    this.cameras.main.shake(300, 0.03);

    const totalScore = this.distance + this.score * 5;

    GameBridge.gameOver({
      score: totalScore,
      stats: { distanceMeters: this.distance, coins: this.score },
    });

    this.time.delayedCall(700, () => {
      this.scene.start('GameOverScene', { score: totalScore, distance: this.distance });
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
    this.add.text(width / 2, height * 0.28, 'CRASHED!', { fontSize: '42px', fontStyle: 'bold', color: '#dc2626' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.38, `DISTANCE: ${this.distance}m`, { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.46, `${this.score} PTS`, { fontSize: '50px', fontStyle: 'bold', color: '#2563eb' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x2563eb).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x60a5fa);
    this.add.text(width / 2, height * 0.65, 'TRY AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
  autoRound: true,
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
    batchSize: 2048,
    clearBeforeRender: true,
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
