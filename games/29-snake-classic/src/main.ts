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
  public state: GameState = GameState.PLAYING;
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

  // Diagonal / Square Touch Gesture State
  public joyKnobX: number = THEME.joyX;
  public joyKnobY: number = THEME.joyY;
  public joyTargetKnobX: number = THEME.joyX;
  public joyTargetKnobY: number = THEME.joyY;
  public isJoyActive: boolean = false;
  public joyDir: Direction | null = null;
  public currentJoyY: number = THEME.joyY;
  public targetJoyY: number = THEME.joyY;
  public isBottomBarVisible: boolean = true;
  private isPointerDown: boolean = false;
  private gestureStartX: number = 0;
  private gestureStartY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.synth = new SoundSynth();
    this.statsManager = new StatsManager();
    this.snake = new Snake();
    this.foodManager = new FoodManager();

    this.currentJoyY = THEME.joyY;
    this.targetJoyY = THEME.joyY;
    this.joyKnobX = THEME.joyX;
    this.joyKnobY = THEME.joyY;

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
    this.startNewMatch();
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

    // 5. Smoothly animate touch control area position when bottom bar moves/toggles
    this.targetJoyY = THEME.joyY;
    this.currentJoyY += (this.targetJoyY - this.currentJoyY) * Math.min(1, dt * 12);

    const cx = THEME.joyX;
    const cy = this.currentJoyY;

    if (this.isJoyActive) {
      // Follow finger smoothly and responsively across 360 degrees
      const followFactor = 1 - Math.exp(-42 * dt);
      this.joyKnobX += (this.joyTargetKnobX - this.joyKnobX) * followFactor;
      this.joyKnobY += (this.joyTargetKnobY - this.joyKnobY) * followFactor;
    } else {
      // Smooth return to center when finger released
      const returnFactor = 1 - Math.exp(-20 * dt);
      this.joyKnobX += (cx - this.joyKnobX) * returnFactor;
      this.joyKnobY += (cy - this.joyKnobY) * returnFactor;
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
      this.gameOverAnimTime,
      this.joyKnobX,
      this.joyKnobY,
      this.isJoyActive,
      this.joyDir,
      this.currentJoyY
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
          Host.post('setSwipeEnabled', { enabled: false });
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

      // 4. Diagonal/Square Touch Gesture Area & Top Bar HUD during Gameplay
      if (this.state === GameState.PLAYING) {
        const dx = px - THEME.joyX;
        const dy = py - this.currentJoyY;
        const inTouchZone = (Math.abs(dx) + Math.abs(dy)) <= THEME.joyRadius * 1.28;
        if (inTouchZone) {
          this.isJoyActive = true;
          Host.post('setSwipeEnabled', { enabled: false });
          this.gestureStartX = px;
          this.gestureStartY = py;
          this.updateTouchGesture(px, py, true);
          return;
        }

        // Mode Badge -> Click to open Difficulty Selection Dialog!
        const mb = THEME.modeBadge;
        if (
          px >= mb.x - 8 &&
          px <= mb.x + mb.w + 8 &&
          py >= mb.y - 8 &&
          py <= mb.y + mb.h + 8
        ) {
          this.synth.playButton();
          this.state = GameState.DIFF_SELECT;
          Host.post('onDifficultySelectOpen', { currentDifficulty: this.difficulty });
          return;
        }

        // Pause Button (||)
        const pause = THEME.pauseBtn;
        const distPause = Math.hypot(px - pause.x, py - pause.y);
        if (distPause <= pause.r * 1.35) {
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

      // Free Touch Gesture Tracking inside Diagonal Control Area
      if (this.isJoyActive) {
        this.updateTouchGesture(px, py, false);
        return;
      }

      // Handle slider drag
      if (this.state === GameState.DIFF_SELECT && this.isDraggingSlider) {
        const bounds = this.renderer.getDifficultyDialogBounds();
        this.updateSliderFromPointer(px, bounds);
        return;
      }
      // Note: Swipe gestures are completely disabled as requested!
    };

    // Pointer Up
    const handlePointerUp = () => {
      this.isPointerDown = false;
      if (this.isJoyActive) {
        this.resetTouchGesture();
        Host.post('setSwipeEnabled', { enabled: true });
      }
      if (this.isDraggingSlider) {
        this.isDraggingSlider = false;
        Host.post('setSwipeEnabled', { enabled: true });
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

    // Dynamic Bottom Bar notification listeners
    window.addEventListener('message', (e: MessageEvent) => {
      if (!e.data) return;
      const act = e.data.action || e.data.type || e.data;
      if (act === 'bottomBar' || act === 'BOTTOM_BAR_CHANGE') {
        this.isBottomBarVisible = Boolean(e.data.visible);
        this.renderer.resize(this.isBottomBarVisible);
        this.targetJoyY = THEME.joyY;
      }
    });

    window.addEventListener('bottomBarChange', (e: any) => {
      if (e.detail) {
        this.isBottomBarVisible = Boolean(e.detail.visible);
        this.renderer.resize(this.isBottomBarVisible);
        this.targetJoyY = THEME.joyY;
      }
    });

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

      let dir: Direction | null = null;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          dir = Direction.UP;
          break;
        case 'ArrowDown':
        case 'KeyS':
          dir = Direction.DOWN;
          break;
        case 'ArrowLeft':
        case 'KeyA':
          dir = Direction.LEFT;
          break;
        case 'ArrowRight':
        case 'KeyD':
          dir = Direction.RIGHT;
          break;
      }

      if (dir !== null) {
        this.snake.requestDirection(dir);
        this.joyDir = dir;
        this.isJoyActive = true;
        const cx = THEME.joyX;
        const cy = this.currentJoyY;
        const offset = THEME.joyMaxDist * 0.88;
        switch (dir) {
          case Direction.RIGHT:
            this.joyTargetKnobX = cx + offset;
            this.joyTargetKnobY = cy;
            break;
          case Direction.LEFT:
            this.joyTargetKnobX = cx - offset;
            this.joyTargetKnobY = cy;
            break;
          case Direction.UP:
            this.joyTargetKnobX = cx;
            this.joyTargetKnobY = cy - offset;
            break;
          case Direction.DOWN:
            this.joyTargetKnobX = cx;
            this.joyTargetKnobY = cy + offset;
            break;
        }
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) {
        if (this.isJoyActive && !this.isPointerDown) {
          this.resetTouchGesture();
        }
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

  private updateTouchGesture(px: number, py: number, isInitialDown: boolean = false): void {
    const cx = THEME.joyX;
    const cy = this.currentJoyY;
    const padR = THEME.joyRadius;

    // 1. Clamp visual feedback position gracefully inside the diamond / diagonal box
    const dxFromCenter = px - cx;
    const dyFromCenter = py - cy;
    const manhattanDist = Math.abs(dxFromCenter) + Math.abs(dyFromCenter);
    const maxBoundary = padR - 10;

    if (manhattanDist > maxBoundary) {
      const scale = maxBoundary / manhattanDist;
      this.joyTargetKnobX = cx + dxFromCenter * scale;
      this.joyTargetKnobY = cy + dyFromCenter * scale;
    } else {
      this.joyTargetKnobX = px;
      this.joyTargetKnobY = py;
    }

    if (isInitialDown) {
      this.joyKnobX = this.joyTargetKnobX;
      this.joyKnobY = this.joyTargetKnobY;
    }

    // 2. Gesture Vector Computation
    const vx = px - this.gestureStartX;
    const vy = py - this.gestureStartY;
    const distFromStart = Math.hypot(vx, vy);

    if (isInitialDown) {
      // If tapped away from center, trigger tap-to-turn direction immediately
      const distCenter = Math.hypot(dxFromCenter, dyFromCenter);
      if (distCenter > 14) {
        this.processDirectionGesture(dxFromCenter, dyFromCenter);
      }
      return;
    }

    // Continuous swipe / movement threshold: 12px
    if (distFromStart >= 12) {
      this.processDirectionGesture(vx, vy);
      // Reset gesture anchor to current point for continuous fluid chaining without lifting finger
      this.gestureStartX = px;
      this.gestureStartY = py;
    }
  }

  private processDirectionGesture(vx: number, vy: number): void {
    if (this.state !== GameState.PLAYING) return;

    const absX = Math.abs(vx);
    const absY = Math.abs(vy);

    // If movement is negligible, ignore
    if (absX < 2 && absY < 2) return;

    const dirH = vx > 0 ? Direction.RIGHT : Direction.LEFT;
    const dirV = vy > 0 ? Direction.DOWN : Direction.UP;

    // Last planned direction in buffer or current direction of snake
    const lastPlanned = this.snake.directionQueue.length > 0
      ? this.snake.directionQueue[this.snake.directionQueue.length - 1]
      : this.snake.currentDirection;

    const isCurrentHorizontal = lastPlanned === Direction.LEFT || lastPlanned === Direction.RIGHT;
    const isCurrentVertical = lastPlanned === Direction.UP || lastPlanned === Direction.DOWN;

    // Cardinal Threshold: if one component is more than 2x the other, it's a cardinal swipe
    if (absX > absY * 2.0) {
      this.snake.requestDirection(dirH);
      this.joyDir = dirH;
      return;
    }
    if (absY > absX * 2.0) {
      this.snake.requestDirection(dirV);
      this.joyDir = dirV;
      return;
    }

    // Diagonal Movement Gesture Handling:
    // Natural snake following for diagonal inputs (horizontal, vertical, and diagonal directions)
    if (isCurrentHorizontal) {
      // Snake is moving horizontally: perpendicular turn is vertical
      this.snake.requestDirection(dirV);
      this.joyDir = dirV;
      // If moving in opposite horizontal direction, queue the requested horizontal turn
      if (dirH !== lastPlanned) {
        this.snake.requestDirection(dirH);
      }
    } else if (isCurrentVertical) {
      // Snake is moving vertically: perpendicular turn is horizontal
      this.snake.requestDirection(dirH);
      this.joyDir = dirH;
      // If moving in opposite vertical direction, queue the requested vertical turn
      if (dirV !== lastPlanned) {
        this.snake.requestDirection(dirV);
      }
    } else {
      if (absX >= absY) {
        this.snake.requestDirection(dirH);
        this.snake.requestDirection(dirV);
        this.joyDir = dirH;
      } else {
        this.snake.requestDirection(dirV);
        this.snake.requestDirection(dirH);
        this.joyDir = dirV;
      }
    }
  }

  private resetTouchGesture(): void {
    this.isJoyActive = false;
    this.joyDir = null;
    this.joyTargetKnobX = THEME.joyX;
    this.joyTargetKnobY = this.currentJoyY;
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
