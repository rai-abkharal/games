import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

const FRUITS = [
  { symbol: '🍎', pts: 100, isBomb: false },
  { symbol: '🍌', pts: 150, isBomb: false },
  { symbol: '🍊', pts: 120, isBomb: false },
  { symbol: '🍉', pts: 200, isBomb: false },
  { symbol: '💣', pts: 0, isBomb: true },
];

interface FallingItem {
  container: Phaser.GameObjects.Container;
  symbol: string;
  pts: number;
  isBomb: boolean;
  speed: number;
}

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
    const title = this.add.text(width / 2, height * 0.28, 'FRUIT CATCH', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.05, duration: 750, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🧺 45-Second Juicy Frenzy', {
      fontSize: '20px', color: '#d97706', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0xd97706).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xfbbf24);

    this.add.text(width / 2, height * 0.6, 'PLAY NOW', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Drag or touch to move your basket.\nCatch fruits and dodge explosive bombs!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private basket!: Phaser.GameObjects.Container;
  private items: FallingItem[] = [];
  private score: number = 0;
  private lives: number = 3;
  private timeLeft: number = 45;
  private isGameOver: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private spawnEvent!: Phaser.Time.TimerEvent;
  private timerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    this.lives = 3;
    this.timeLeft = 45;
    this.isGameOver = false;
    this.items = [];

    const { width, height } = this.scale;

    // Header UI
    this.scoreText = this.add.text(24, 24, 'SCORE: 0', { fontSize: '20px', fontStyle: 'bold', color: '#0f172a' });
    this.livesText = this.add.text(width / 2, 24, '❤️ ❤️ ❤️', { fontSize: '18px' }).setOrigin(0.5, 0);
    this.timerText = this.add.text(width - 24, 24, '45s', { fontSize: '20px', fontStyle: 'bold', color: '#d97706' }).setOrigin(1, 0);

    // Basket at bottom (Rich Wood Texture)
    const basketBox = this.add.rectangle(0, 0, 96, 44, 0xb45309).setStrokeStyle(3, 0x78350f);
    const basketRim = this.add.rectangle(0, -20, 104, 10, 0x92400e);
    const basketLabel = this.add.text(0, 2, '🧺', { fontSize: '26px' }).setOrigin(0.5);
    this.basket = this.add.container(width / 2, height - 90, [basketBox, basketRim, basketLabel]);

    // Touch & Drag Controls
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      if (pointer.isDown) {
        this.basket.x = Phaser.Math.Clamp(pointer.x, 52, width - 52);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      this.basket.x = Phaser.Math.Clamp(pointer.x, 52, width - 52);
    });

    // Spawner
    this.spawnEvent = this.time.addEvent({
      delay: 600,
      callback: this.spawnItem,
      callbackScope: this,
      loop: true,
    });

    // Timer countdown
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.timeLeft--;
        this.timerText.setText(`${this.timeLeft}s`);
        if (this.timeLeft <= 0) {
          this.endGame();
        }
      },
      loop: true,
    });

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private spawnItem() {
    if (this.isGameOver) return;
    const { width } = this.scale;
    const itemData = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const x = Phaser.Math.Between(40, width - 40);
    const y = -40;

    const bgCircle = this.add.circle(0, 0, 22, itemData.isBomb ? 0xfecaca : 0xfef3c7, 0.9);
    const text = this.add.text(0, 0, itemData.symbol, { fontSize: '32px' }).setOrigin(0.5);
    const container = this.add.container(x, y, [bgCircle, text]);

    const speed = Phaser.Math.Between(260, 440) + (45 - this.timeLeft) * 3;
    this.items.push({
      container,
      symbol: itemData.symbol,
      pts: itemData.pts,
      isBomb: itemData.isBomb,
      speed,
    });
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;
    const dt = delta / 1000;
    const { height } = this.scale;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.container.y += item.speed * dt;

      // Basket collision
      const dist = Phaser.Math.Distance.Between(this.basket.x, this.basket.y, item.container.x, item.container.y);
      if (dist < 46) {
        if (item.isBomb) {
          // BOMB HIT!
          SoundFx.playHit();
          GameBridge.haptic('heavy');
          this.cameras.main.shake(200, 0.02);
          this.lives--;
          const hearts = ['💀 💀 💀', '❤️ 💀 💀', '❤️ ❤️ 💀', '❤️ ❤️ ❤️'];
          this.livesText.setText(hearts[Math.max(0, this.lives)]);

          if (this.lives <= 0) {
            this.endGame();
            return;
          }
        } else {
          // FRUIT CAUGHT!
          SoundFx.playScore();
          GameBridge.haptic('light');
          this.score += item.pts;
          this.scoreText.setText(`SCORE: ${this.score}`);

          // Popup text
          const popup = this.add.text(item.container.x, item.container.y, `+${item.pts}`, {
            fontSize: '18px', fontStyle: 'bold', color: '#d97706',
          }).setOrigin(0.5);
          this.tweens.add({
            targets: popup, y: popup.y - 30, alpha: 0, duration: 500, onComplete: () => popup.destroy(),
          });
        }

        item.container.destroy();
        this.items.splice(i, 1);
        continue;
      }

      if (item.container.y > height + 50) {
        item.container.destroy();
        this.items.splice(i, 1);
      }
    }
  }

  private endGame() {
    this.isGameOver = true;
    this.spawnEvent.remove();
    this.timerEvent.remove();
    SoundFx.playGameOver();

    GameBridge.gameOver({
      score: this.score,
      timeSpentSeconds: 45 - this.timeLeft,
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
    this.add.text(width / 2, height * 0.28, 'GAME OVER', { fontSize: '40px', fontStyle: 'bold', color: '#dc2626' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.40, 'JUICE HARVEST', { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, `${this.score} PTS`, { fontSize: '52px', fontStyle: 'bold', color: '#d97706' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0xd97706).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xfbbf24);
    this.add.text(width / 2, height * 0.65, 'CATCH AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 480,
  height: 800,
  backgroundColor: '#f8f6f0',
  transparent: false,
  roundPixels: false,
  antialias: false,
  fps: {
    target: 120,
    min: 30,
    forceSetTimeOut: false,
    deltaHistory: 10,
    smoothStep: true,
  },
  render: {
    powerPreference: 'high-performance',
    desynchronized: false,
    batchSize: 2048,
    clearBeforeRender: true,
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
