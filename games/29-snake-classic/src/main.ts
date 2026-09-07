import {
  Difficulty,
  DIFFICULTIES,
  GameState,
  Direction,
  HostBridge,
  ImpactParticle
} from './game/Types.js';
import { Snake } from './game/Snake.js';
import { FoodManager } from './game/Food.js';
import { StatsManager } from './game/StatsManager.js';
import { Grid } from './game/Grid.js';
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
  public statsManager: StatsManager;
  public snake: Snake;
  public foodManager: FoodManager;

  // Game States
  public state: GameState = GameState.DIFF_SELECT;
  public difficulty: Difficulty = Difficulty.Easy;
  public sliderPos: number = 0;
  public isDraggingSlider: boolean = false;

  // Timers & Transitions
  private lastTime: number = 0;
  public freezeTimer: number = 0;
  public resultOverlayAlpha: number = 0;
  public gameOverAnimTime: number = 0;

  // Impact VFX
  public impactStar: { x: number; y: number; scale: number; alpha: number } | null = null;
  public impactParticles: ImpactParticle[] = [];

  // Gesture Controls
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private isPointerDown: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.synth = new SoundSynth();
    this.statsManager = new StatsManager();
    this.snake = new Snake();
    this.foodManager = new FoodManager();

    // Read stored difficulty
    try {
      const storedDiff = localStorage.getItem('cute_snake_difficulty');
      if (storedDiff && Object.values(Difficulty).includes(storedDiff as Difficulty)) {
        this.difficulty = storedDiff as Difficulty;
        this.sliderPos = DIFFICULTIES.findIndex(d => d.id === this.difficulty);
        if (this.sliderPos < 0) this.sliderPos = 0;
      }
    } catch {}

    this.initEvents();
    this.state = GameState.DIFF_SELECT;
  }

  public startNewMatch(diff?: Difficulty): void {
    if (diff) {
      this.difficulty = diff;
      this.sliderPos = DIFFICULTIES.findIndex(d => d.id === diff);
      try {
        localStorage.setItem('cute_snake_difficulty', diff);
      } catch {}
    }

    const diffConfig = DIFFICULTIES.find(d => d.id === this.difficulty) || DIFFICULTIES[0];
    this.snake.reset();
    this.snake.setSpeed(diffConfig.cellsPerSecond);

    this.foodManager.init(diffConfig.activeFoods, this.snake.getOccupiedCells());

    this.impactStar = null;
    this.impactParticles = [];
    this.freezeTimer = 0;
    this.resultOverlayAlpha = 0;
    this.gameOverAnimTime = 0;

    this.state = GameState.PLAYING;
    Host.post('onGameStarted', { difficulty: this.difficulty });
  }

  public pauseGame(): void {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
      this.synth.playButton();
    }
  }

  public resumeGame(): void {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      this.synth.playButton();
    }
  }

  public triggerCollision(collisionGridPos: { x: number; y: number }): void {
    this.state = GameState.COLLISION_FREEZE;
    this.freezeTimer = 0.85; // ~0.85 sec freeze delay
    this.synth.playImpact();

    // Calculate pixel center for impact star
    const pt = this.renderer.gridToPixel(collisionGridPos.x, collisionGridPos.y);
    this.impactStar = {
      x: pt.x,
      y: pt.y,
      scale: 1.0,
      alpha: 1.0
    };

    // Spawn sparks
    this.impactParticles = [];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 70 + Math.random() * 110;
      this.impactParticles.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        alpha: 1.0,
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        color: Math.random() > 0.4 ? '#FFFFFF' : '#FFE6AD'
      });
    }
  }

  // Main Loop
  public start(): void {
    this.lastTime = performance.now();
    const loop = (currentTime: number) => {
      const dt = Math.min(0.1, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  public update(dt: number): void {
    // 1. Gameplay State Updates
    if (this.state === GameState.PLAYING) {
      this.snake.stepTimer += dt;

      // Check if it is time for a logical grid tick
      while (this.snake.stepTimer >= this.snake.stepDuration) {
        this.snake.stepTimer -= this.snake.stepDuration;

        // Apply next queued direction
        if (this.snake.directionQueue.length > 0) {
          this.snake.currentDirection = this.snake.directionQueue.shift()!;
        }

        const head = this.snake.getHead();
        const dirVec = Grid.getDirectionVector(this.snake.currentDirection);
        const nextHead = { x: head.x + dirVec.x, y: head.y + dirVec.y };

        // Wall Collision Check
        if (!Grid.isInside(nextHead)) {
          this.triggerCollision(nextHead);
          return;
        }

        // Self Collision Check
        if (this.snake.isOccupying(nextHead, true)) {
          this.triggerCollision(nextHead);
          return;
        }

        // Check Food Eaten
        const eatenFood = this.foodManager.checkEaten(nextHead);

        // Save snapshot of previous body for smooth 60fps interpolation
        this.snake.prevBody = this.snake.body.map(c => ({ ...c }));

        // Insert new head
        this.snake.body.unshift(nextHead);

        if (eatenFood) {
          this.synth.playCollect();
          this.snake.score += 1;
          this.foodManager.removeAndRespawn(eatenFood, this.snake.body);

          // Real-time record update check
          const liveRecord = this.statsManager.getLiveAllTime(this.difficulty, this.snake.score);
          if (this.snake.score >= liveRecord) {
            this.statsManager.recordScore(this.difficulty, this.snake.score);
          }
        } else {
          // Standard move: remove tail
          this.snake.body.pop();
        }
      }
    }

    // 2. Collision Freeze Sequence (~0.85s)
    if (this.state === GameState.COLLISION_FREEZE) {
      this.freezeTimer -= dt;

      // Update impact star and spark particles
      if (this.impactStar) {
        this.impactStar.scale += dt * 0.8;
        this.impactStar.alpha = Math.max(0, this.freezeTimer / 0.85);
      }

      for (const p of this.impactParticles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        p.alpha = Math.max(0, p.alpha - dt * 1.8);
      }

      if (this.freezeTimer <= 0) {
        this.state = GameState.RESULT_TRANSITION;
        this.resultOverlayAlpha = 0;
        this.statsManager.recordScore(this.difficulty, this.snake.score);
        this.synth.playGameOver();
        Host.post('onGameOver', { score: this.snake.score, difficulty: this.difficulty });
      }
    }

    // 3. Result Overlay Transition (~0.3s)
    if (this.state === GameState.RESULT_TRANSITION) {
      this.resultOverlayAlpha = Math.min(1.0, this.resultOverlayAlpha + dt / 0.28);
      if (this.resultOverlayAlpha >= 1.0) {
        this.state = GameState.GAME_OVER;
        this.gameOverAnimTime = 0;
      }
    }

    // 4. Game Over Card Staggered Stats Sequence
    if (this.state === GameState.GAME_OVER) {
      this.gameOverAnimTime += dt;
    }
  }

  public render(): void {
    const progress = this.state === GameState.PLAYING
      ? this.snake.stepTimer / this.snake.stepDuration
      : 1.0;

    const visualSegments = this.snake.getVisualSegments(progress);
    const liveAllTime = this.statsManager.getLiveAllTime(this.difficulty, this.snake.score);
    const stats = this.statsManager.getStats(this.difficulty);

    this.renderer.render(
      this.state,
      this.difficulty,
      this.sliderPos,
      this.snake.score,
      liveAllTime,
      stats,
      visualSegments,
      this.snake.currentDirection,
      this.foodManager.items,
      this.impactParticles,
      this.impactStar,
      this.resultOverlayAlpha,
      this.gameOverAnimTime
    );
  }

  // --------------------------------------------------------------------------
  // INPUT HANDLING: Pointer, Gestures, Keyboard
  // --------------------------------------------------------------------------
  private initEvents(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });
    this.renderer.resize();

    // Pointer Down
    const handlePointerDown = (e: PointerEvent) => {
      this.synth.init();
      const pos = this.renderer.toVirtual(e.clientX, e.clientY);
      const px = pos.x;
      const py = pos.y;

      this.pointerStartX = px;
      this.pointerStartY = py;
      this.isPointerDown = true;

      // 1. Difficulty Modal Input
      if (this.state === GameState.DIFF_SELECT) {
        const bounds = this.renderer.getDifficultyDialogBounds();

        // Close button (X)
        if (
          px >= bounds.cardX + bounds.cardW - 44 &&
          px <= bounds.cardX + bounds.cardW &&
          py >= bounds.cardY &&
          py <= bounds.cardY + 44
        ) {
          this.synth.playButton();
          this.startNewMatch(this.difficulty);
          return;
        }

        // Tap on Slider Track
        if (
          py >= bounds.trackY - 24 &&
          py <= bounds.trackY + bounds.trackH + 24 &&
          px >= bounds.trackX - 16 &&
          px <= bounds.trackX + bounds.trackW + 16
        ) {
          this.isDraggingSlider = true;
          this.updateSliderFromPointer(px, bounds);
          return;
        }

        // PLAY ▶ Button
        if (
          px >= bounds.playX &&
          px <= bounds.playX + bounds.playW &&
          py >= bounds.playY &&
          py <= bounds.playY + bounds.playH
        ) {
          this.synth.playButton();
          const targetDiff = DIFFICULTIES[Math.round(this.sliderPos)].id;
          this.startNewMatch(targetDiff);
          return;
        }
        return;
      }

      // 2. Game Over Modal Input
      if (this.state === GameState.GAME_OVER) {
        const b = this.renderer.getGameOverBounds();

        // Home Button (Coral) -> Return to Difficulty Selection
        if (
          px >= b.homeX &&
          px <= b.homeX + b.homeW &&
          py >= b.homeY &&
          py <= b.homeY + b.homeH
        ) {
          this.synth.playButton();
          this.state = GameState.DIFF_SELECT;
          Host.post('onHome', {});
          return;
        }

        // PLAY AGAIN Button (Green) -> Restart Run Immediately
        if (
          px >= b.playX &&
          px <= b.playX + b.playW &&
          py >= b.playY &&
          py <= b.playY + b.playH
        ) {
          this.synth.playButton();
          this.startNewMatch(this.difficulty);
          return;
        }
        return;
      }

      // 3. Paused Screen Tap to Resume
      if (this.state === GameState.PAUSED) {
        this.resumeGame();
        return;
      }

      // 4. Top Bar HUD during Gameplay
      if (this.state === GameState.PLAYING) {
        // Back Button (<)
        const back = THEME.backBtn;
        const distBack = Math.hypot(px - back.x, py - back.y);
        if (distBack <= back.r * 1.3) {
          this.synth.playButton();
          this.state = GameState.DIFF_SELECT;
          Host.post('onBack', {});
          return;
        }

        // Pause Button (||)
        const pause = THEME.pauseBtn;
        const distPause = Math.hypot(px - pause.x, py - pause.y);
        if (distPause <= pause.r * 1.3) {
          this.pauseGame();
          return;
        }
      }
    };

    // Pointer Move
    const handlePointerMove = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      const pos = this.renderer.toVirtual(e.clientX, e.clientY);
      const px = pos.x;
      const py = pos.y;

      // Handle slider drag
      if (this.state === GameState.DIFF_SELECT && this.isDraggingSlider) {
        const bounds = this.renderer.getDifficultyDialogBounds();
        this.updateSliderFromPointer(px, bounds);
        return;
      }

      // Handle swipe gesture during playing
      if (this.state === GameState.PLAYING) {
        const dx = px - this.pointerStartX;
        const dy = py - this.pointerStartY;
        const dist = Math.hypot(dx, dy);

        const minSwipe = Math.max(18, THEME.cellSize * 0.7);
        if (dist >= minSwipe) {
          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) this.snake.requestDirection(Direction.RIGHT);
            else this.snake.requestDirection(Direction.LEFT);
          } else {
            if (dy > 0) this.snake.requestDirection(Direction.DOWN);
            else this.snake.requestDirection(Direction.UP);
          }
          // Reset anchor for continuous multi-step swiping
          this.pointerStartX = px;
          this.pointerStartY = py;
        }
      }
    };

    // Pointer Up
    const handlePointerUp = () => {
      this.isPointerDown = false;
      if (this.isDraggingSlider) {
        this.isDraggingSlider = false;
        // Snap to nearest notch
        this.sliderPos = Math.max(0, Math.min(2, Math.round(this.sliderPos)));
        this.difficulty = DIFFICULTIES[this.sliderPos].id;
        this.synth.playButton();
      }
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // Keyboard Controls
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.synth.init();

      if (e.code === 'KeyP' || e.code === 'Space') {
        if (this.state === GameState.PLAYING) this.pauseGame();
        else if (this.state === GameState.PAUSED) this.resumeGame();
        return;
      }

      if (e.code === 'Escape') {
        if (this.state === GameState.PLAYING) {
          this.state = GameState.DIFF_SELECT;
          Host.post('onBack', {});
        } else if (this.state === GameState.DIFF_SELECT) {
          this.startNewMatch(this.difficulty);
        }
        return;
      }

      if (this.state !== GameState.PLAYING) return;

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.snake.requestDirection(Direction.UP);
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.snake.requestDirection(Direction.DOWN);
          break;
        case 'ArrowLeft':
        case 'KeyA':
          this.snake.requestDirection(Direction.LEFT);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.snake.requestDirection(Direction.RIGHT);
          break;
      }
    });
  }

  private updateSliderFromPointer(
    px: number,
    bounds: { trackX: number; trackW: number; knobR: number }
  ): void {
    const usableW = bounds.trackW - 2 * bounds.knobR;
    const relX = px - (bounds.trackX + bounds.knobR);
    const normalized = Math.max(0, Math.min(1, relX / usableW));
    this.sliderPos = normalized * 2;
    const snapped = Math.max(0, Math.min(2, Math.round(this.sliderPos)));
    if (this.difficulty !== DIFFICULTIES[snapped].id) {
      this.difficulty = DIFFICULTIES[snapped].id;
    }
  }
}

// Auto-boot on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (canvas) {
    const game = new Game(canvas);
    game.start();
    (window as any).snakeGame = game;
  }
});
