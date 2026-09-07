import {
  ROWS,
  COLS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  Cell,
  GameState,
  Difficulty,
  DIFFICULTIES,
  CellPosition,
  FallingPiece,
  PreviewPiece,
  HostBridge
} from './game/Types.js';
import { Rules } from './game/Rules.js';
import { AI } from './game/AI.js';
import { SoundSynth } from './audio/SoundSynth.js';
import { Renderer } from './rendering/Renderer.js';
import { THEME } from './rendering/Theme.js';

export const Host: HostBridge = {
  post(action: string, payload: any = {}) {
    const msg = JSON.stringify({ action, payload });
    try {
      if ((window as any).flutter_inappwebview?.callHandler) {
        (window as any).flutter_inappwebview.callHandler('GameBridgeChannel', msg);
      }
    } catch {}
    try {
      if ((window as any).FlutterGameBridge?.postMessage) {
        (window as any).FlutterGameBridge.postMessage(msg);
      }
    } catch {}
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'GameBridge', action, payload }, '*');
      }
    } catch {}
  }
};

export class Game {
  public canvas: HTMLCanvasElement;
  public renderer: Renderer;
  public synth: SoundSynth;

  public state: GameState = GameState.PLAYER_AIMING;
  public board: Cell[][] = Rules.createEmptyBoard();
  public difficulty: Difficulty = Difficulty.Easy;
  public sliderPos: number = 0;
  public isDraggingSlider: boolean = false;

  // Turn interpolation (0 = Human Coral, 1 = Bot Cyan)
  public turnProgress: number = 0;
  public targetTurnProgress: number = 0;

  // "Your turn" bottom HUD
  public yourTurnTimer: number = 0;
  public yourTurnProgress: number = 0;

  // Bot thinking animation
  public botThinkingTimer: number = 0;
  public botThinkingDuration: number = 0;

  // Pieces & Animations
  public previewPiece: PreviewPiece = {
    x: THEME.slotCentersX[3],
    y: THEME.previewY,
    col: 3,
    visible: true
  };
  public isAiming: boolean = false;
  public fallingPiece: FallingPiece | null = null;

  // Win & Result
  public winningCells: CellPosition[] | null = null;
  public winLineProgress: number = 0;
  public winHoldTimer: number = 0;
  public resultOverlayOpacity: number = 0;
  public winner: Cell | null = null;

  // Race condition protection
  public matchId: number = 0;
  private lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.synth = new SoundSynth();

    // Read stored difficulty
    try {
      const storedDiff = localStorage.getItem('four_in_a_row_difficulty');
      if (storedDiff && Object.values(Difficulty).includes(storedDiff as Difficulty)) {
        this.difficulty = storedDiff as Difficulty;
        this.sliderPos = DIFFICULTIES.findIndex(d => d.id === this.difficulty);
        if (this.sliderPos < 0) this.sliderPos = 0;
      }
    } catch {}

    this.initEvents();
    this.startNewMatch(this.difficulty);
  }

  public startNewMatch(diff?: Difficulty): void {
    this.matchId++;
    const currentId = this.matchId;

    if (diff) {
      this.difficulty = diff;
      this.sliderPos = DIFFICULTIES.findIndex(d => d.id === diff);
      try {
        localStorage.setItem('four_in_a_row_difficulty', diff);
      } catch {}
    }

    this.board = Rules.createEmptyBoard();
    this.fallingPiece = null;
    this.winningCells = null;
    this.winLineProgress = 0;
    this.winHoldTimer = 0;
    this.resultOverlayOpacity = 0;
    this.winner = null;

    // Reset Turn
    this.turnProgress = 0;
    this.targetTurnProgress = 0;

    // Player Starts
    this.startPlayerTurn();
    Host.post('onGameStarted', { difficulty: this.difficulty });
  }

  public startPlayerTurn(): void {
    this.targetTurnProgress = 0; // Crossfade to Coral
    this.state = GameState.PLAYER_AIMING;

    // Reset Preview Piece above center column
    this.previewPiece.visible = true;
    this.previewPiece.col = 3;
    this.previewPiece.x = THEME.slotCentersX[3];
    this.previewPiece.y = THEME.previewY;

    // Trigger "Your turn" bottom circle animation (~1 second total)
    this.yourTurnTimer = 1.0;
    this.yourTurnProgress = 0;

    this.synth.playTurn();
  }

  public async startBotTurn(): Promise<void> {
    const id = this.matchId;
    this.previewPiece.visible = false;
    this.state = GameState.BOT_THINKING;
    this.targetTurnProgress = 1; // Crossfade to Cyan

    // Thinking duration based on difficulty (700ms - 1050ms)
    this.botThinkingDuration = 0.75 + Math.random() * 0.3;
    this.botThinkingTimer = this.botThinkingDuration;

    this.synth.playTurn();

    // Async delay matching the video's realistic cadence
    setTimeout(() => {
      if (id !== this.matchId || this.state !== GameState.BOT_THINKING) return;
      this.executeBotMove();
    }, this.botThinkingDuration * 1000);
  }

  private executeBotMove(): void {
    const col = AI.findBestMove(this.board, this.difficulty, Cell.Bot, Cell.Player);
    if (col < 0) return;

    const row = Rules.getAvailableRow(this.board, col);
    if (row < 0) return;

    this.state = GameState.BOT_DROPPING;
    this.startPieceDrop(Cell.Bot, row, col);
  }

  public startPieceDrop(player: Cell, row: number, col: number): void {
    const startX = THEME.slotCentersX[col];
    const startY = THEME.previewY;
    const targetY = THEME.slotCentersY[row];

    this.fallingPiece = {
      player,
      col,
      row,
      x: startX,
      y: startY,
      targetY,
      velocityY: 140, // Initial push
      bounceCount: 0,
      settled: false
    };

    this.synth.playDrop();
  }

  // Handle Piece Settling & Check Win
  private onPieceSettled(piece: FallingPiece): void {
    this.board[piece.row][piece.col] = piece.player;
    this.fallingPiece = null;

    // 1. Check Win
    const win = Rules.getConnectedCells(this.board, piece.row, piece.col, piece.player);
    if (win) {
      this.winningCells = win;
      this.winner = piece.player;
      this.state = GameState.WIN_LINE_ANIMATION;
      this.winLineProgress = 0;
      this.winHoldTimer = 0.95;

      if (piece.player === Cell.Player) {
        this.synth.playWin();
      } else {
        this.synth.playLose();
      }
      return;
    }

    // 2. Check Draw
    if (Rules.isBoardFull(this.board)) {
      this.winner = null;
      this.state = GameState.RESULT_TRANSITION;
      this.resultOverlayOpacity = 0;
      return;
    }

    // 3. Alternate Turn
    if (piece.player === Cell.Player) {
      this.startBotTurn();
    } else {
      this.startPlayerTurn();
    }
  }

  // Update Game Loop
  public update(dt: number): void {
    // 1. Smooth Background Crossfade (dt based)
    const fadeSpeed = 4.5;
    if (this.turnProgress < this.targetTurnProgress) {
      this.turnProgress = Math.min(this.targetTurnProgress, this.turnProgress + fadeSpeed * dt);
    } else if (this.turnProgress > this.targetTurnProgress) {
      this.turnProgress = Math.max(this.targetTurnProgress, this.turnProgress - fadeSpeed * dt);
    }

    // 2. "Your turn" bottom HUD animation
    if (this.yourTurnTimer > 0) {
      this.yourTurnTimer -= dt;
      if (this.yourTurnTimer > 0.7) {
        this.yourTurnProgress = (1.0 - this.yourTurnTimer) / 0.3;
      } else if (this.yourTurnTimer > 0.3) {
        this.yourTurnProgress = 1.0;
      } else {
        this.yourTurnProgress = Math.max(0, this.yourTurnTimer / 0.3);
      }
    } else {
      this.yourTurnProgress = 0;
    }

    // 3. Bot Thinking Timer
    if (this.state === GameState.BOT_THINKING) {
      this.botThinkingTimer += dt;
    }

    // 4. Gravity & Multi-Bounce Falling Piece Physics
    if (this.fallingPiece && !this.fallingPiece.settled) {
      const p = this.fallingPiece;
      const gravity = 2700; // Realistic acceleration (pixels/sec^2)

      p.velocityY += gravity * dt;
      p.y += p.velocityY * dt;

      if (p.y >= p.targetY) {
        p.y = p.targetY;
        p.bounceCount++;

        // Landing Impact Sound
        if (p.bounceCount === 1) {
          this.synth.playImpact(Math.min(1.0, Math.abs(p.velocityY) / 750));
        } else {
          this.synth.playBounce();
        }

        // Rebound with restitution
        p.velocityY = -p.velocityY * 0.28;

        // Settling threshold
        if (p.bounceCount >= 3 || Math.abs(p.velocityY) < 45) {
          p.y = p.targetY;
          p.settled = true;
          this.onPieceSettled(p);
        }
      }
    }

    // 5. Winning Line Animation (230ms)
    if (this.state === GameState.WIN_LINE_ANIMATION) {
      this.winLineProgress = Math.min(1.0, this.winLineProgress + dt / 0.23);
      if (this.winLineProgress >= 1.0) {
        // Hold for ~950ms
        this.winHoldTimer -= dt;
        if (this.winHoldTimer <= 0) {
          this.state = GameState.RESULT_TRANSITION;
        }
      }
    }

    // 6. Result Overlay Transition (300ms)
    if (this.state === GameState.RESULT_TRANSITION) {
      this.resultOverlayOpacity = Math.min(1.0, this.resultOverlayOpacity + dt / 0.3);
      if (this.resultOverlayOpacity >= 1.0) {
        this.state = GameState.RESULT_SCREEN;

        // Post Game Completed bridge
        const diffConfig = DIFFICULTIES.find(d => d.id === this.difficulty) || DIFFICULTIES[0];
        Host.post('onGameCompleted', {
          score: this.winner === Cell.Player ? 100 : 10,
          coins: this.winner === Cell.Player ? diffConfig.coins : 0,
          winner: this.winner === Cell.Player ? 'player' : this.winner === Cell.Bot ? 'bot' : 'draw',
          difficulty: this.difficulty
        });
      }
    }
  }

  // Render Frame
  public render(): void {
    this.renderer.render(
      this.state,
      this.board,
      this.difficulty,
      this.sliderPos,
      this.turnProgress,
      this.yourTurnProgress,
      this.botThinkingTimer,
      this.fallingPiece,
      this.previewPiece,
      this.winningCells,
      this.winLineProgress,
      this.resultOverlayOpacity,
      this.winner,
      this.synth
    );
  }

  // Pointer & Input Handling
  private initEvents(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });
    this.renderer.resize();

    const handlePointerDown = (e: PointerEvent) => {
      this.synth.init();
      const pos = this.renderer.toVirtual(e.clientX, e.clientY);
      const px = pos.x;
      const py = pos.y;

      // 1. Difficulty Modal Input
      if (this.state === GameState.DIFF_SELECT) {
        const bounds = this.renderer.getDifficultyDialogBounds();

        // Close button (X)
        if (px >= bounds.cardX + bounds.cardW - 40 && px <= bounds.cardX + bounds.cardW &&
            py >= bounds.cardY && py <= bounds.cardY + 45) {
          this.synth.playButton();
          this.state = GameState.PLAYER_AIMING;
          return;
        }

        // Tap on Slider Track
        if (py >= bounds.trackY - 20 && py <= bounds.trackY + bounds.trackH + 20 &&
            px >= bounds.trackX - 10 && px <= bounds.trackX + bounds.trackW + 10) {
          this.isDraggingSlider = true;
          this.updateSliderFromPointer(px, bounds);
          return;
        }

        // PLAY ▶ Button
        if (px >= bounds.playX && px <= bounds.playX + bounds.playW &&
            py >= bounds.playY && py <= bounds.playY + bounds.playH) {
          this.synth.playButton();
          const targetDiff = DIFFICULTIES[Math.round(this.sliderPos)].id;
          this.startNewMatch(targetDiff);
          return;
        }

        // [ ? ] Tutorial Button
        if (px >= bounds.qX && px <= bounds.qX + bounds.qSize &&
            py >= bounds.qY && py <= bounds.qY + bounds.qSize) {
          this.synth.playButton();
          this.state = GameState.TUTORIAL;
          return;
        }

        // Tap outside card to dismiss
        if (px < bounds.cardX || px > bounds.cardX + bounds.cardW ||
            py < bounds.cardY || py > bounds.cardY + bounds.cardH) {
          this.synth.playButton();
          this.state = GameState.PLAYER_AIMING;
          return;
        }

        return;
      }

      // 2. Tutorial Modal Input
      if (this.state === GameState.TUTORIAL) {
        this.synth.playButton();
        this.state = GameState.DIFF_SELECT;
        return;
      }

      // 3. Top Header Navigation Buttons
      // Top Left: Back button
      if (Math.hypot(px - 46, py - 72) <= 28) {
        this.synth.playButton();
        Host.post('onBack');
        this.state = GameState.DIFF_SELECT;
        return;
      }

      // Difficulty Pill Banner
      if (px >= 96 && px <= 232 && py >= 53 && py <= 91) {
        this.synth.playButton();
        this.sliderPos = DIFFICULTIES.findIndex(d => d.id === this.difficulty);
        this.state = GameState.DIFF_SELECT;
        return;
      }

      // Sound Toggle Button
      if (px >= 244 && px <= 290 && py >= 53 && py <= 91) {
        this.synth.toggleMute();
        return;
      }

      // Top Right: Restart Button
      if (Math.hypot(px - 354, py - 72) <= 28) {
        this.synth.playButton();
        this.startNewMatch(this.difficulty);
        return;
      }

      // 4. Result Screen Buttons
      if (this.state === GameState.RESULT_SCREEN) {
        const btnY = 730;

        // Home Button
        if (px >= 50 && px <= 108 && py >= btnY && py <= btnY + 58) {
          this.synth.playButton();
          Host.post('onBack');
          this.state = GameState.DIFF_SELECT;
          return;
        }

        // PLAY AGAIN Button
        if (px >= 124 && px <= 276 && py >= btnY && py <= btnY + 58) {
          this.synth.playButton();
          this.startNewMatch(this.difficulty);
          return;
        }

        // Difficulty / Settings Button
        if (px >= 292 && px <= 350 && py >= btnY && py <= btnY + 58) {
          this.synth.playButton();
          this.state = GameState.DIFF_SELECT;
          return;
        }

        return;
      }

      // 5. Player Aiming / Dropping Controls
      if (this.state === GameState.PLAYER_AIMING) {
        // Direct tap on column below board
        if (py >= THEME.boardY && py <= THEME.boardY + THEME.boardH) {
          const nearestCol = this.findNearestColumn(px);
          this.previewPiece.col = nearestCol;
          this.previewPiece.x = THEME.slotCentersX[nearestCol];

          const row = Rules.getAvailableRow(this.board, nearestCol);
          if (row >= 0) {
            this.state = GameState.PLAYER_DROPPING;
            this.startPieceDrop(Cell.Player, row, nearestCol);
          }
          return;
        }

        // Aiming drag above board
        this.isAiming = true;
        this.updateAimingFromPointer(px);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const pos = this.renderer.toVirtual(e.clientX, e.clientY);
      const px = pos.x;

      if (this.state === GameState.DIFF_SELECT && this.isDraggingSlider) {
        const bounds = this.renderer.getDifficultyDialogBounds();
        this.updateSliderFromPointer(px, bounds);
        return;
      }

      if (this.state === GameState.PLAYER_AIMING && this.isAiming) {
        this.updateAimingFromPointer(px);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (this.isDraggingSlider) {
        this.isDraggingSlider = false;
        this.sliderPos = Math.round(this.sliderPos);
        this.difficulty = DIFFICULTIES[this.sliderPos].id;
        this.synth.playButton();
      }

      if (this.state === GameState.PLAYER_AIMING && this.isAiming) {
        this.isAiming = false;
        const col = this.previewPiece.col;
        const row = Rules.getAvailableRow(this.board, col);

        if (row >= 0) {
          this.state = GameState.PLAYER_DROPPING;
          this.startPieceDrop(Cell.Player, row, col);
        }
      }
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  private updateAimingFromPointer(px: number): void {
    const minX = THEME.slotCentersX[0];
    const maxX = THEME.slotCentersX[COLS - 1];
    const clampedX = Math.max(minX, Math.min(maxX, px));

    this.previewPiece.x = clampedX;
    this.previewPiece.col = this.findNearestColumn(clampedX);
  }

  private findNearestColumn(px: number): number {
    let nearestIdx = 0;
    let minDist = Infinity;

    for (let c = 0; c < COLS; c++) {
      const dist = Math.abs(px - THEME.slotCentersX[c]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = c;
      }
    }
    return nearestIdx;
  }

  private updateSliderFromPointer(px: number, bounds: any): void {
    const usableW = bounds.trackW - 2 * bounds.knobR;
    const relX = px - (bounds.trackX + bounds.knobR);
    const frac = Math.max(0, Math.min(1, relX / usableW));
    const targetVal = frac * 2; // 0 (Easy), 1 (Medium), 2 (Hard)

    const prevRounded = Math.round(this.sliderPos);
    this.sliderPos = targetVal;
    const newRounded = Math.round(this.sliderPos);

    if (newRounded !== prevRounded) {
      this.difficulty = DIFFICULTIES[newRounded].id;
      this.synth.playButton();
    }
  }

  // Animation Loop
  public startLoop(): void {
    this.lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - this.lastTime) / 1000);
      this.lastTime = time;

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Startup
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (canvas) {
    const game = new Game(canvas);
    game.startLoop();
    (window as any).__game = game;
  }
});
