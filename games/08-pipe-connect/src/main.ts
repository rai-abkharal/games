import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

// Pipe types: 'straight' (top-bottom), 'elbow' (top-right), 'cross' (all 4)
interface PipeTile {
  r: number;
  c: number;
  type: 'straight' | 'elbow' | 'cross' | 't-shape';
  rotation: number; // 0, 1, 2, 3 (multiples of 90)
  container: Phaser.GameObjects.Container;
  lines: Phaser.GameObjects.Graphics;
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
    const title = this.add.text(width / 2, height * 0.28, 'PIPE CONNECT', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.06, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '💧 Rotate & Connect Flow', {
      fontSize: '20px', color: '#0284c7', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x0284c7).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x38bdf8);

    this.add.text(width / 2, height * 0.6, 'SOLVE PUZZLE', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Tap tiles to rotate pipes.\nConnect the water source 💧 to destination 🏆!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private grid: PipeTile[][] = [];
  private rows: number = 4;
  private cols: number = 4;
  private seconds: number = 0;
  private isConnected: boolean = false;
  
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private timerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.seconds = 0;
    this.isConnected = false;
    this.grid = [];

    const { width, height } = this.scale;

    // Header UI
    this.add.text(24, 24, '💧 -> 🏆', { fontSize: '22px', fontStyle: 'bold', color: '#0284c7' });
    this.timerText = this.add.text(width - 24, 24, 'TIME: 0s', { fontSize: '20px', fontStyle: 'bold', color: '#d97706' }).setOrigin(1, 0);
    this.statusText = this.add.text(width / 2, height * 0.16, 'Rotate tiles to create a path', { fontSize: '16px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.seconds++;
        this.timerText.setText(`TIME: ${this.seconds}s`);
      },
      loop: true,
    });

    // Create 4x4 Grid
    const tileSize = 84;
    const gridW = this.cols * tileSize;
    const startX = (width - gridW) / 2 + tileSize / 2;
    const startY = height * 0.26 + tileSize / 2;

    const predefined = [
      ['elbow', 'straight', 'elbow', 'elbow'],
      ['straight', 'elbow', 'straight', 'elbow'],
      ['elbow', 'straight', 'elbow', 'straight'],
      ['elbow', 'straight', 'straight', 'elbow'],
    ];

    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        const type = predefined[r][c] as any;
        const initRot = Phaser.Math.Between(1, 3); // initial scrambled rotation

        const tileBg = this.add.rectangle(0, 0, tileSize - 6, tileSize - 6, 0xffffff)
          .setStrokeStyle(2, 0xcbd5e1, 0.9);

        const linesGfx = this.add.graphics();
        this.drawPipe(linesGfx, type, tileSize);

        const container = this.add.container(startX + c * tileSize, startY + r * tileSize, [tileBg, linesGfx]);
        container.setSize(tileSize, tileSize);
        container.setInteractive({ useHandCursor: true });
        linesGfx.setAngle(initRot * 90);

        const tile: PipeTile = {
          r,
          c,
          type,
          rotation: initRot,
          container,
          lines: linesGfx,
        };

        container.on('pointerdown', () => this.rotateTile(tile));
        this.grid[r][c] = tile;
      }
    }

    // Source (top-left) & Destination (bottom-right) markers
    this.add.text(startX, startY - 56, '💧 SOURCE', { fontSize: '15px', fontStyle: 'bold', color: '#0284c7' }).setOrigin(0.5);
    this.add.text(startX + (this.cols - 1) * tileSize, startY + (this.rows - 1) * tileSize + 56, '🏆 DRAIN', { fontSize: '15px', fontStyle: 'bold', color: '#d97706' }).setOrigin(0.5);

    // Initial check
    this.checkFlow();

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private drawPipe(gfx: Phaser.GameObjects.Graphics, type: string, size: number) {
    gfx.clear();
    const half = size / 2;
    gfx.lineStyle(16, 0x0284c7, 1);

    if (type === 'straight') {
      gfx.lineBetween(0, -half + 4, 0, half - 4);
    } else if (type === 'elbow') {
      gfx.beginPath();
      gfx.moveTo(0, -half + 4);
      gfx.lineTo(0, 0);
      gfx.lineTo(half - 4, 0);
      gfx.strokePath();
    } else {
      gfx.lineBetween(-half + 4, 0, half - 4, 0);
      gfx.lineBetween(0, -half + 4, 0, half - 4);
    }
  }

  private rotateTile(tile: PipeTile) {
    if (this.isConnected) return;
    tile.rotation = (tile.rotation + 1) % 4;
    SoundFx.playTap();
    GameBridge.haptic('light');

    this.tweens.add({
      targets: tile.lines,
      angle: tile.rotation * 90,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => this.checkFlow(),
    });
  }

  private getOpenings(tile: PipeTile): { top: boolean; right: boolean; bottom: boolean; left: boolean } {
    const rot = tile.rotation % 4;
    if (tile.type === 'straight') {
      return rot % 2 === 0
        ? { top: true, right: false, bottom: true, left: false }
        : { top: false, right: true, bottom: false, left: true };
    } else if (tile.type === 'elbow') {
      // 0: top-right, 1: right-bottom, 2: bottom-left, 3: left-top
      return {
        top: rot === 0 || rot === 3,
        right: rot === 0 || rot === 1,
        bottom: rot === 1 || rot === 2,
        left: rot === 2 || rot === 3,
      };
    }
    return { top: true, right: true, bottom: true, left: true };
  }

  private checkFlow() {
    // BFS from (0,0) to (rows-1, cols-1)
    const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    const queue: [number, number][] = [[0, 0]];
    visited[0][0] = true;

    let reachedGoal = false;

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (r === this.rows - 1 && c === this.cols - 1) {
        reachedGoal = true;
        break;
      }

      const currOpen = this.getOpenings(this.grid[r][c]);

      // Up
      if (currOpen.top && r > 0 && !visited[r - 1][c] && this.getOpenings(this.grid[r - 1][c]).bottom) {
        visited[r - 1][c] = true;
        queue.push([r - 1, c]);
      }
      // Down
      if (currOpen.bottom && r < this.rows - 1 && !visited[r + 1][c] && this.getOpenings(this.grid[r + 1][c]).top) {
        visited[r + 1][c] = true;
        queue.push([r + 1, c]);
      }
      // Left
      if (currOpen.left && c > 0 && !visited[r][c - 1] && this.getOpenings(this.grid[r][c - 1]).right) {
        visited[r][c - 1] = true;
        queue.push([r][c - 1]);
      }
      // Right
      if (currOpen.right && c < this.cols - 1 && !visited[r][c + 1] && this.getOpenings(this.grid[r][c + 1]).left) {
        visited[r][c + 1] = true;
        queue.push([r][c + 1]);
      }
    }

    if (reachedGoal && !this.isConnected) {
      this.handleSuccess();
    }
  }

  private handleSuccess() {
    this.isConnected = true;
    this.timerEvent.remove();
    SoundFx.playSuccess();
    GameBridge.haptic('success');
    this.statusText.setText('FLOW CONNECTED! 🌊').setColor('#059669');

    const score = Math.max(150, 1500 - this.seconds * 20);

    GameBridge.completed({
      score,
      level: 1,
      stats: { seconds: this.seconds },
    });

    this.time.delayedCall(700, () => {
      this.scene.start('GameOverScene', { score, seconds: this.seconds });
    });
  }
}

class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  private seconds: number = 0;

  constructor() { super({ key: 'GameOverScene' }); }
  init(data: any) {
    this.score = data.score || 0;
    this.seconds = data.seconds || 0;
  }

  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height * 0.28, 'PUZZLE SOLVED!', { fontSize: '38px', fontStyle: 'bold', color: '#0284c7' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.38, `🌊 Time: ${this.seconds}s`, { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, `${this.score} PTS`, { fontSize: '52px', fontStyle: 'bold', color: '#d97706' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x0284c7).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x38bdf8);
    this.add.text(width / 2, height * 0.65, 'PLAY AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

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
    target: 120,
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
