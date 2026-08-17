import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

const COLORS = [
  { name: 'RED', hex: 0xef4444, str: '#ef4444' },
  { name: 'GREEN', hex: 0x16a34a, str: '#16a34a' },
  { name: 'BLUE', hex: 0x2563eb, str: '#2563eb' },
  { name: 'YELLOW', hex: 0xd97706, str: '#d97706' },
  { name: 'PURPLE', hex: 0x7c3aed, str: '#7c3aed' },
  { name: 'ORANGE', hex: 0xea580c, str: '#ea580c' },
];

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
    const title = this.add.text(width / 2, height * 0.28, 'COLOR MATCH', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title, scale: 1.05, duration: 700, yoyo: true, repeat: -1,
    });

    this.add.text(width / 2, height * 0.38, '⚡ 60s Speed Reaction', {
      fontSize: '20px', color: '#64748b', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x7c3aed)
      .setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xa78bfa);

    this.add.text(width / 2, height * 0.6, 'PLAY NOW', {
      fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Tap the tile that matches the color banner.\nAvoid mistakes and keep your streak!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private targetColor: any = null;
  private score: number = 0;
  private lives: number = 3;
  private timeLeft: number = 60;
  private combo: number = 0;
  private isGameOver: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private tilesContainer!: Phaser.GameObjects.Container;
  private timerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    this.lives = 3;
    this.timeLeft = 60;
    this.combo = 0;
    this.isGameOver = false;

    const { width, height } = this.scale;

    // Header UI
    this.scoreText = this.add.text(24, 24, 'SCORE: 0', { fontSize: '20px', fontStyle: 'bold', color: '#0f172a' });
    this.livesText = this.add.text(width / 2, 24, '❤️ ❤️ ❤️', { fontSize: '18px' }).setOrigin(0.5, 0);
    this.timerText = this.add.text(width - 24, 24, '60s', { fontSize: '20px', fontStyle: 'bold', color: '#d97706' }).setOrigin(1, 0);

    // Target Color Banner (Clean White Card)
    this.bannerBg = this.add.rectangle(width / 2, height * 0.22, width - 48, 90, 0xffffff, 1)
      .setStrokeStyle(2, 0xe2e8f0);
    this.bannerText = this.add.text(width / 2, height * 0.22, '', {
      fontSize: '32px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    // Tiles container
    this.tilesContainer = this.add.container(0, 0);

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.tick,
      callbackScope: this,
      loop: true,
    });

    this.generateRound();

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private generateRound() {
    if (this.isGameOver) return;
    this.tilesContainer.removeAll(true);

    const { width, height } = this.scale;
    const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
    const roundColors = shuffled.slice(0, 4);
    
    // Choose target
    this.targetColor = roundColors[Math.floor(Math.random() * roundColors.length)];
    this.bannerText.setText(`MATCH: ${this.targetColor.name}`);
    this.bannerText.setColor(this.targetColor.str);

    // Render 4 large tiles in 2x2 grid
    const tileW = 180;
    const tileH = 140;
    const startX = width / 2 - tileW / 2 - 10;
    const startY = height * 0.42;

    const positions = [
      { x: startX, y: startY },
      { x: startX + tileW + 20, y: startY },
      { x: startX, y: startY + tileH + 20 },
      { x: startX + tileW + 20, y: startY + tileH + 20 },
    ];

    roundColors.forEach((color, idx) => {
      const pos = positions[idx];
      const tile = this.add.rectangle(pos.x, pos.y, tileW, tileH, color.hex)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(3, 0xffffff, 0.9);

      const label = this.add.text(pos.x, pos.y, color.name, {
        fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5);

      tile.on('pointerdown', () => this.handleTileTap(color, tile));

      this.tilesContainer.add([tile, label]);
    });
  }

  private handleTileTap(color: any, tile: Phaser.GameObjects.Rectangle) {
    if (this.isGameOver) return;

    if (color.name === this.targetColor.name) {
      // Correct!
      SoundFx.playScore();
      GameBridge.haptic('light');
      this.combo++;
      const pts = 100 + this.combo * 15;
      this.score += pts;
      this.scoreText.setText(`SCORE: ${this.score}`);

      this.tweens.add({
        targets: tile,
        scale: 1.08,
        duration: 80,
        yoyo: true,
        onComplete: () => this.generateRound(),
      });
    } else {
      // Wrong!
      SoundFx.playHit();
      GameBridge.haptic('heavy');
      this.combo = 0;
      this.lives--;
      this.cameras.main.shake(150, 0.01);
      
      const hearts = ['💀 💀 💀', '❤️ 💀 💀', '❤️ ❤️ 💀', '❤️ ❤️ ❤️'];
      this.livesText.setText(hearts[Math.max(0, this.lives)]);

      if (this.lives <= 0) {
        this.endGame();
      } else {
        this.generateRound();
      }
    }
  }

  private tick() {
    this.timeLeft--;
    this.timerText.setText(`${this.timeLeft}s`);
    if (this.timeLeft <= 0) {
      this.endGame();
    }
  }

  private endGame() {
    this.isGameOver = true;
    this.timerEvent.remove();
    SoundFx.playGameOver();

    GameBridge.gameOver({
      score: this.score,
      timeSpentSeconds: 60 - this.timeLeft,
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
    this.add.text(width / 2, height * 0.3, 'GAME OVER', { fontSize: '40px', fontStyle: 'bold', color: '#dc2626' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.42, 'FINAL SCORE', { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.5, `${this.score}`, { fontSize: '54px', fontStyle: 'bold', color: '#7c3aed' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.66, 220, 60, 0x7c3aed).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xa78bfa);
    this.add.text(width / 2, height * 0.66, 'PLAY AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
