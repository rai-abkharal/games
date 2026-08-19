import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

const DOT_COLORS: Record<number, number> = {
  2: 0x8b5cf6,
  4: 0x3b82f6,
  8: 0x06b6d4,
  16: 0x10b981,
  32: 0xd97706,
  64: 0xea580c,
  128: 0xef4444,
  256: 0xdb2777,
  512: 0xc026d3,
  1024: 0x7c3aed,
  2048: 0xf59e0b,
};

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
    const title = this.add.text(width / 2, height * 0.28, 'MERGE DOTS', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.05, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🔮 2048-Style Number Synthesis', {
      fontSize: '20px', color: '#7c3aed', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x7c3aed).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xa78bfa);

    this.add.text(width / 2, height * 0.6, 'MERGE NOW', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Swipe Up/Down/Left/Right to merge dots.\nCombine matching numbers into 2048!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private board: number[][] = [];
  private size: number = 4;
  private score: number = 0;
  private isGameOver: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private gridContainer!: Phaser.GameObjects.Container;
  private startPointer!: Phaser.Math.Vector2;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.score = 0;
    this.isGameOver = false;
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));

    const { width, height } = this.scale;

    // Header UI
    this.scoreText = this.add.text(24, 24, 'SCORE: 0', { fontSize: '22px', fontStyle: 'bold', color: '#0f172a' });

    // Grid Container
    this.gridContainer = this.add.container(0, 0);

    // Initial board background (Warm Gray Board)
    const tileSize = 84;
    const gap = 12;
    const boardW = this.size * tileSize + (this.size - 1) * gap;
    const startX = (width - boardW) / 2 + tileSize / 2;
    const startY = height * 0.28 + tileSize / 2;

    const bgBoard = this.add.rectangle(width / 2, height * 0.28 + boardW / 2 - tileSize / 2, boardW + 24, boardW + 24, 0xede8e1)
      .setStrokeStyle(2, 0xd6d1c7);
    this.gridContainer.add(bgBoard);

    // Spawn 2 initial dots
    this.spawnRandomDot();
    this.spawnRandomDot();
    this.renderBoard(startX, startY, tileSize, gap);

    // Swipe controls
    this.startPointer = new Phaser.Math.Vector2();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      this.startPointer.set(pointer.x, pointer.y);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      const dx = pointer.x - this.startPointer.x;
      const dy = pointer.y - this.startPointer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 30) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) this.move('RIGHT', startX, startY, tileSize, gap);
          else this.move('LEFT', startX, startY, tileSize, gap);
        } else {
          if (dy > 0) this.move('DOWN', startX, startY, tileSize, gap);
          else this.move('UP', startX, startY, tileSize, gap);
        }
      }
    });

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private spawnRandomDot() {
    const emptyCells: [number, number][] = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) {
          emptyCells.push([r, c]);
        }
      }
    }

    if (emptyCells.length > 0) {
      const [r, c] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      this.board[r][c] = Math.random() < 0.85 ? 2 : 4;
    }
  }

  private renderBoard(startX: number, startY: number, tileSize: number, gap: number) {
    // Clear previous tile sprites (keep bgBoard at index 0)
    while (this.gridContainer.length > 1) {
      this.gridContainer.getAt(1).destroy();
    }

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const x = startX + c * (tileSize + gap);
        const y = startY + r * (tileSize + gap);
        const val = this.board[r][c];

        // Slot bg (Pure White/Cream Cell)
        const slot = this.add.rectangle(x, y, tileSize, tileSize, 0xf8f6f0, 1)
          .setStrokeStyle(1, 0xd6d1c7);
        this.gridContainer.add(slot);

        if (val > 0) {
          const color = DOT_COLORS[val] || 0xf59e0b;
          const circle = this.add.circle(x, y, tileSize / 2 - 6, color)
            .setStrokeStyle(3, 0xffffff);
          const txt = this.add.text(x, y, `${val}`, {
            fontSize: val > 512 ? '20px' : val > 64 ? '24px' : '28px',
            fontStyle: 'bold',
            color: '#ffffff',
          }).setOrigin(0.5);

          this.gridContainer.add([circle, txt]);
        }
      }
    }
  }

  private move(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', startX: number, startY: number, tileSize: number, gap: number) {
    let moved = false;
    let mergedScore = 0;

    const slideRow = (row: number[]): { newRow: number[]; gained: number; changed: boolean } => {
      const filtered = row.filter((x) => x > 0);
      const res: number[] = [];
      let gained = 0;
      let i = 0;
      while (i < filtered.length) {
        if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
          const combined = filtered[i] * 2;
          res.push(combined);
          gained += combined;
          i += 2;
        } else {
          res.push(filtered[i]);
        }
      }
      while (res.length < this.size) res.push(0);
      const changed = res.some((val, idx) => val !== row[idx]);
      return { newRow: res, gained, changed };
    };

    if (dir === 'LEFT' || dir === 'RIGHT') {
      for (let r = 0; r < this.size; r++) {
        let row = [...this.board[r]];
        if (dir === 'RIGHT') row.reverse();
        const { newRow, gained, changed } = slideRow(row);
        if (dir === 'RIGHT') newRow.reverse();
        if (changed) moved = true;
        mergedScore += gained;
        this.board[r] = newRow;
      }
    } else {
      for (let c = 0; c < this.size; c++) {
        let col = [this.board[0][c], this.board[1][c], this.board[2][c], this.board[3][c]];
        if (dir === 'DOWN') col.reverse();
        const { newRow, gained, changed } = slideRow(col);
        if (dir === 'DOWN') newRow.reverse();
        if (changed) moved = true;
        mergedScore += gained;
        for (let r = 0; r < this.size; r++) {
          this.board[r][c] = newRow[r];
        }
      }
    }

    if (moved) {
      if (mergedScore > 0) {
        SoundFx.playScore();
        GameBridge.haptic('medium');
        this.score += mergedScore;
        this.scoreText.setText(`SCORE: ${this.score}`);
      } else {
        SoundFx.playTap();
        GameBridge.haptic('light');
      }

      this.spawnRandomDot();
      this.renderBoard(startX, startY, tileSize, gap);

      if (this.checkGameOver()) {
        this.endGame();
      }
    }
  }

  private checkGameOver(): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) return false;
        if (c + 1 < this.size && this.board[r][c] === this.board[r][c + 1]) return false;
        if (r + 1 < this.size && this.board[r][c] === this.board[r + 1][c]) return false;
      }
    }
    return true;
  }

  private endGame() {
    this.isGameOver = true;
    SoundFx.playGameOver();
    GameBridge.haptic('heavy');

    GameBridge.gameOver({
      score: this.score,
      stats: { finalScore: this.score },
    });

    this.time.delayedCall(700, () => {
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
    this.add.text(width / 2, height * 0.28, 'NO MORE MOVES!', { fontSize: '38px', fontStyle: 'bold', color: '#dc2626' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.40, 'MERGE SCORE', { fontSize: '20px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.48, `${this.score} PTS`, { fontSize: '52px', fontStyle: 'bold', color: '#7c3aed' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x7c3aed).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0xa78bfa);
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
