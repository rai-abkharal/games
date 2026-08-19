import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

interface PlacedBlock {
  rect: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
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
    const title = this.add.text(width / 2, height * 0.28, 'STACK TOWER', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title, scale: 1.06, duration: 800, yoyo: true, repeat: -1,
    });

    this.add.text(width / 2, height * 0.38, '🏗️ Tap to Build & Slice', {
      fontSize: '20px', color: '#059669', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x059669)
      .setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x34d399);

    this.add.text(width / 2, height * 0.6, 'START STACKING', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Tap to drop moving blocks.\nLine them up perfectly for combo bonuses!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private score: number = 0;
  private perfectStreak: number = 0;
  private isGameOver: boolean = false;
  private blockHeight: number = 36;
  private currentBlockWidth: number = 240;
  private currentSpeed: number = 240;
  private movingDir: number = 1;
  
  private movingBlock!: Phaser.GameObjects.Rectangle;
  private tower: PlacedBlock[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    this.perfectStreak = 0;
    this.isGameOver = false;
    this.currentBlockWidth = 240;
    this.currentSpeed = 240;
    this.movingDir = 1;
    this.tower = [];

    const { width, height } = this.scale;
    this.cameras.main.scrollY = 0;

    // UI (fixed to camera)
    this.scoreText = this.add.text(24, 24, 'TOWER: 0', {
      fontSize: '24px', fontStyle: 'bold', color: '#0f172a',
    }).setScrollFactor(0).setDepth(100);

    this.streakText = this.add.text(width - 24, 24, '', {
      fontSize: '20px', fontStyle: 'bold', color: '#d97706',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    // Initial Base Block
    const baseY = height - 120;
    const baseColor = this.getColorForLevel(0);
    const baseRect = this.add.rectangle(width / 2, baseY, this.currentBlockWidth, this.blockHeight, baseColor);
    this.tower.push({
      rect: baseRect,
      x: width / 2,
      y: baseY,
      width: this.currentBlockWidth,
      height: this.blockHeight,
      color: baseColor,
    });

    // Spawn first moving block
    this.spawnMovingBlock();

    // One-tap input
    this.input.on('pointerdown', () => this.dropBlock());

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private getColorForLevel(lvl: number): number {
    const hue = (lvl * 16) % 360;
    const color = Phaser.Display.Color.HSLToColor(hue / 360, 0.7, 0.5);
    return color.color;
  }

  private spawnMovingBlock() {
    if (this.isGameOver) return;
    const { width } = this.scale;
    const nextLevel = this.tower.length;
    const prevBlock = this.tower[this.tower.length - 1];
    const targetY = prevBlock.y - this.blockHeight;
    const color = this.getColorForLevel(nextLevel);

    this.movingDir = Math.random() < 0.5 ? 1 : -1;
    const startX = this.movingDir === 1 ? -this.currentBlockWidth / 2 : width + this.currentBlockWidth / 2;

    this.movingBlock = this.add.rectangle(startX, targetY, this.currentBlockWidth, this.blockHeight, color);
    this.currentSpeed = Math.min(240 + nextLevel * 8, 480);
  }

  update(_time: number, delta: number) {
    if (this.isGameOver || !this.movingBlock) return;

    const dt = delta / 1000;
    const { width } = this.scale;

    this.movingBlock.x += this.currentSpeed * this.movingDir * dt;

    if (this.movingBlock.x > width + this.currentBlockWidth / 2) {
      this.movingBlock.x = width + this.currentBlockWidth / 2;
      this.movingDir = -1;
    } else if (this.movingBlock.x < -this.currentBlockWidth / 2) {
      this.movingBlock.x = -this.currentBlockWidth / 2;
      this.movingDir = 1;
    }
  }

  private dropBlock() {
    if (this.isGameOver || !this.movingBlock) return;

    const prevBlock = this.tower[this.tower.length - 1];
    const diff = this.movingBlock.x - prevBlock.x;
    const absDiff = Math.abs(diff);

    // Perfect placement tolerance
    const tolerance = 4;

    if (absDiff <= tolerance) {
      // PERFECT!
      this.perfectStreak++;
      SoundFx.playScore();
      GameBridge.haptic('light');

      this.movingBlock.x = prevBlock.x;
      this.streakText.setText(`PERFECT x${this.perfectStreak}!`);
      this.currentBlockWidth = Math.min(this.currentBlockWidth + 4, 240); // small expand reward
    } else if (absDiff < this.currentBlockWidth) {
      // SLICED
      this.perfectStreak = 0;
      this.streakText.setText('');
      SoundFx.playSlice();
      GameBridge.haptic('medium');

      const newWidth = this.currentBlockWidth - absDiff;
      const newX = prevBlock.x + diff / 2;

      // Sliced falling piece
      const overhangWidth = absDiff;
      const overhangX = diff > 0
        ? newX + newWidth / 2 + overhangWidth / 2
        : newX - newWidth / 2 - overhangWidth / 2;

      const slicePiece = this.add.rectangle(
        overhangX,
        this.movingBlock.y,
        overhangWidth,
        this.blockHeight,
        (this.movingBlock as any).fillColor
      );

      this.tweens.add({
        targets: slicePiece,
        y: slicePiece.y + 300,
        rotation: diff > 0 ? 0.8 : -0.8,
        alpha: 0,
        duration: 800,
        onComplete: () => slicePiece.destroy(),
      });

      this.currentBlockWidth = newWidth;
      this.movingBlock.width = newWidth;
      this.movingBlock.x = newX;
    } else {
      // MISSED COMPLETELY -> GAME OVER
      this.endGame();
      return;
    }

    // Add to tower
    this.tower.push({
      rect: this.movingBlock,
      x: this.movingBlock.x,
      y: this.movingBlock.y,
      width: this.currentBlockWidth,
      height: this.blockHeight,
      color: (this.movingBlock as any).fillColor,
    });

    this.score++;
    this.scoreText.setText(`TOWER: ${this.score}`);

    // Smooth camera scroll up if tower reaches top half
    const { height } = this.scale;
    const targetScrollY = Math.min(0, this.movingBlock.y - height * 0.6);
    this.tweens.add({
      targets: this.cameras.main,
      scrollY: targetScrollY,
      duration: 300,
      ease: 'Quad.easeOut',
    });

    // Next block
    this.spawnMovingBlock();
  }

  private endGame() {
    this.isGameOver = true;
    SoundFx.playGameOver();
    GameBridge.haptic('heavy');

    if (this.movingBlock) {
      this.tweens.add({
        targets: this.movingBlock,
        y: this.movingBlock.y + 400,
        alpha: 0,
        duration: 700,
      });
    }

    GameBridge.gameOver({
      score: this.score,
      timeSpentSeconds: this.score * 2,
      stats: { towerHeight: this.score },
    });

    this.time.delayedCall(800, () => {
      this.scene.start('GameOverScene', { score: this.score });
    });
  }
}

class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  constructor() { super({ key: 'GameOverScene' }); }
  init(data: any) { this.score = data.score || 0; }
  create() {
    const { width, height } = this.scale;
    this.cameras.main.scrollY = 0;

    this.add.text(width / 2, height * 0.28, 'TOWER COLLAPSED!', {
      fontSize: '36px', fontStyle: 'bold', color: '#dc2626',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.40, 'FINAL HEIGHT', { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, `${this.score} FLOORS`, {
      fontSize: '48px', fontStyle: 'bold', color: '#059669',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x059669).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x34d399);
    this.add.text(width / 2, height * 0.65, 'RETRY', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
