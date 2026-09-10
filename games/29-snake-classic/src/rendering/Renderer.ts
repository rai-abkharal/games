import {
  GRID_COLS,
  GRID_ROWS,
  Difficulty,
  DIFFICULTIES,
  GameState,
  FoodItem,
  ModeStats,
  Direction,
  VisualPos,
  ImpactParticle
} from '../game/Types.js';
import { THEME, updateLayout } from './Theme.js';
import { drawDifficultyEmoji } from './DifficultyEmoji.js';

// Polyfill for universal Android WebView & older browser roundRect compatibility
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  (CanvasRenderingContext2D.prototype as any).roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[] = 0
  ) {
    if (w === 0 || h === 0) return this;
    let r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    if (r.length === 1) r = [r[0], r[0], r[0], r[0]];
    if (r.length === 2) r = [r[0], r[1], r[0], r[1]];
    if (r.length === 3) r = [r[0], r[1], r[2], r[1]];

    const maxR = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
    const rTL = Math.min(Math.max(0, r[0]), maxR);
    const rTR = Math.min(Math.max(0, r[1]), maxR);
    const rBR = Math.min(Math.max(0, r[2]), maxR);
    const rBL = Math.min(Math.max(0, r[3]), maxR);

    this.moveTo(x + rTL, y);
    this.lineTo(x + w - rTR, y);
    if (rTR > 0) this.quadraticCurveTo(x + w, y, x + w, y + rTR);
    this.lineTo(x + w, y + h - rBR);
    if (rBR > 0) this.quadraticCurveTo(x + w, y + h, x + w - rBR, y + h);
    this.lineTo(x + rBL, y + h);
    if (rBL > 0) this.quadraticCurveTo(x, y + h, x, y + h - rBL);
    this.lineTo(x, y + rTL);
    if (rTL > 0) this.quadraticCurveTo(x, y, x + rTL, y);
    this.closePath();
    return this;
  };
}

export class Renderer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public width: number = 400;
  public height: number = 800;
  public dpr: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to obtain 2D canvas context');
    this.ctx = context;
  }

  public resize(isBottomBarVisible: boolean = true): void {
    const parent = this.canvas.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;

    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.width = w;
    this.height = h;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    updateLayout(w, h, isBottomBarVisible);
  }

  public toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // Convert logical grid cell to canvas pixel center
  public gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
    const cs = THEME.cellSize;
    return {
      x: THEME.boardX + (gridX + 0.5) * cs,
      y: THEME.boardY + (gridY + 0.5) * cs
    };
  }

  // Render Full Frame
  public render(
    state: GameState,
    difficulty: Difficulty,
    sliderPos: number,
    score: number,
    liveAllTime: number,
    stats: ModeStats,
    segments: VisualPos[],
    currentDir: Direction,
    foods: FoodItem[],
    impactParticles: ImpactParticle[],
    impactStar: { x: number; y: number; scale: number; alpha: number } | null,
    overlayAlpha: number,
    gameOverAnimTime: number,
    joyKnobX: number = THEME.joyX,
    joyKnobY: number = THEME.joyY,
    isJoyActive: boolean = false,
    joyDir: Direction | null = null,
    currentJoyY?: number
  ): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Full-Bleed Sky Blue Background
    ctx.fillStyle = THEME.bgSky;
    ctx.fillRect(0, 0, w, h);

    // 2. Top Header HUD (Back, Badges, Pause)
    this.renderTopHUD(ctx, difficulty, liveAllTime);

    // 3. Playable Arena (Dark Navy Frame + Checkerboard)
    this.renderArena(ctx);

    // 4. Red Food Items
    this.renderFoods(ctx, foods);

    // 5. Snake (Tail -> Body -> Cartoon Head)
    this.renderSnake(ctx, segments, currentDir);

    // 6. Impact Star & Burst Particles
    this.renderImpactVFX(ctx, impactStar, impactParticles);

    // 7. Floating Semi-Transparent Virtual Joystick (gameplay visible underneath)
    if (state === GameState.PLAYING || state === GameState.PAUSED || state === GameState.COLLISION_FREEZE) {
      this.renderJoystick(ctx, joyKnobX, joyKnobY, isJoyActive, joyDir, currentJoyY);
    }

    // 8. Paused Screen Overlay
    if (state === GameState.PAUSED) {
      this.renderPausedOverlay(ctx);
    }

    // 9. Game Over / Result Card Transition & Screen
    if (state === GameState.RESULT_TRANSITION || state === GameState.GAME_OVER) {
      this.renderGameOverCard(ctx, difficulty, score, stats, overlayAlpha, gameOverAnimTime);
    }

    // 10. Difficulty Selection Modal
    if (state === GameState.DIFF_SELECT) {
      this.renderDifficultyDialog(ctx, sliderPos);
    }
  }

  // --------------------------------------------------------------------------
  // TOP BAR HUD: Mode (Clickable Difficulty Button), Crown All-Time, Pause Button
  // --------------------------------------------------------------------------
  private renderTopHUD(
    ctx: CanvasRenderingContext2D,
    difficulty: Difficulty,
    liveAllTime: number
  ): void {
    const diffConfig = DIFFICULTIES.find(d => d.id === difficulty) || DIFFICULTIES[0];

    // 1. Current Difficulty Button (Opens Difficulty Dialog on Tap!)
    const mb = THEME.modeBadge;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    (ctx as any).roundRect(mb.x, mb.y, mb.w, mb.h, mb.r);
    ctx.fillStyle = THEME.headerBadgeBg;
    ctx.fill();

    // Subtle border highlight
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();

    drawDifficultyEmoji(ctx, diffConfig.emblem, mb.x + mb.w / 2, mb.y + mb.h * 0.33, mb.h * 0.40);

    // Selected mode under its existing emoji.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(mb.h * 0.27)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(diffConfig.label, mb.x + mb.w / 2, mb.y + mb.h * 0.74);
    ctx.restore();

    // 2. Crown All-Time Badge
    const at = THEME.allTimeBadge;
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(at.x, at.y, at.w, at.h, at.r);
    ctx.fillStyle = THEME.headerBadgeBg;
    ctx.fill();

    // Crown sticking out over top border
    this.drawCrown(ctx, at.x + at.w / 2, at.y - 1, Math.round(at.w * 0.28), THEME.headerBadgeBg);

    // "ALL TIME" Text in Aqua
    ctx.font = `800 ${Math.round(at.h * 0.26)}px Fredoka, Inter, sans-serif`;
    ctx.fillStyle = THEME.crownAqua;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ALL TIME', at.x + at.w / 2, at.y + at.h * 0.33);

    // All Time Best Score
    ctx.font = `900 ${Math.round(at.h * 0.42)}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(String(liveAllTime), at.x + at.w / 2, at.y + at.h * 0.72);
    ctx.restore();

    // 3. Top-Right Pause Button (White circle, pink pause bars)
    const pause = THEME.pauseBtn;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(pause.x, pause.y, pause.r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.uiWhite;
    ctx.fill();
    ctx.restore();

    // Pink pause bars (||)
    ctx.save();
    ctx.fillStyle = THEME.uiPinkChevron;
    const barW = Math.max(3.2, pause.r * 0.16);
    const barH = pause.r * 0.75;
    const gap = pause.r * 0.26;
    const barR = barW / 2;

    // Left bar
    ctx.beginPath();
    (ctx as any).roundRect(pause.x - gap - barW, pause.y - barH / 2, barW, barH, barR);
    ctx.fill();

    // Right bar
    ctx.beginPath();
    (ctx as any).roundRect(pause.x + gap, pause.y - barH / 2, barW, barH, barR);
    ctx.fill();
    ctx.restore();
  }

  // Draw 3-pointed cartoon crown
  private drawCrown(
    ctx: CanvasRenderingContext2D,
    cx: number,
    baseY: number,
    width: number,
    color: string
  ): void {
    const crownH = width * 0.45;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - width / 2, baseY);
    ctx.lineTo(cx - width / 2, baseY - crownH * 0.75);
    ctx.lineTo(cx - width * 0.22, baseY - crownH * 0.3);
    ctx.lineTo(cx, baseY - crownH);
    ctx.lineTo(cx + width * 0.22, baseY - crownH * 0.3);
    ctx.lineTo(cx + width / 2, baseY - crownH * 0.75);
    ctx.lineTo(cx + width / 2, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // ARENA: Dark Navy Rectangular Frame + 13x21 Checkerboard
  // --------------------------------------------------------------------------
  private renderArena(ctx: CanvasRenderingContext2D): void {
    const bx = THEME.boardX;
    const by = THEME.boardY;
    const bw = THEME.boardW;
    const bh = THEME.boardH;
    const bwThick = THEME.borderWidth;
    const cs = THEME.cellSize;

    // Dark Navy Thick Rectangular Outer Frame
    ctx.save();
    ctx.fillStyle = THEME.arenaBorder;
    ctx.fillRect(bx - bwThick, by - bwThick, bw + bwThick * 2, bh + bwThick * 2);
    ctx.restore();

    // 13 x 21 Checkerboard Squares
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? THEME.boardLight : THEME.boardDark;
        ctx.fillRect(bx + c * cs, by + r * cs, cs, cs);
      }
    }
  }

  // --------------------------------------------------------------------------
  // FOOD COLLECTIBLES: Red Berry Token with Center Seed and Sprout
  // --------------------------------------------------------------------------
  private renderFoods(ctx: CanvasRenderingContext2D, foods: FoodItem[]): void {
    const cs = THEME.cellSize;
    const radius = cs * 0.43;

    for (const food of foods) {
      const px = THEME.boardX + (food.x + 0.5) * cs;
      const py = THEME.boardY + (food.y + 0.5) * cs;

      // Drop shadow (bottom-right)
      ctx.save();
      ctx.beginPath();
      ctx.arc(px + cs * 0.08, py + cs * 0.09, radius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.foodShadow;
      ctx.fill();
      ctx.restore();

      // Outer red berry circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#FF5243';
      ctx.fill();
      ctx.lineWidth = Math.max(2, cs * 0.085);
      ctx.strokeStyle = '#9C2219';
      ctx.stroke();

      // Center Seed with Sprout oriented by food.rotation
      ctx.translate(px, py);
      ctx.rotate(food.rotation);

      // Dark teardrop seed body
      ctx.beginPath();
      ctx.moveTo(radius * 0.36, 0);
      ctx.quadraticCurveTo(radius * 0.04, radius * 0.26, -radius * 0.16, radius * 0.18);
      ctx.arc(-radius * 0.16, 0, radius * 0.18, Math.PI / 2, -Math.PI / 2);
      ctx.quadraticCurveTo(radius * 0.04, -radius * 0.26, radius * 0.36, 0);
      ctx.closePath();
      ctx.fillStyle = '#1F100E';
      ctx.fill();

      // Bright lime-green sprout leaf at the pointed seed tip
      ctx.beginPath();
      ctx.moveTo(radius * 0.32, 0);
      ctx.quadraticCurveTo(radius * 0.44, -radius * 0.14, radius * 0.58, 0);
      ctx.quadraticCurveTo(radius * 0.44, radius * 0.14, radius * 0.32, 0);
      ctx.closePath();
      ctx.fillStyle = '#60CE28';
      ctx.fill();
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = '#1E6F22';
      ctx.stroke();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // SNAKE RENDERING: Articulated Stretched Segments, Oversized Eyes, Seamless Leaf Tail
  // --------------------------------------------------------------------------
  private renderSnake(ctx: CanvasRenderingContext2D, segments: VisualPos[], dir: Direction): void {
    if (!segments.length) return;
    const cs = THEME.cellSize;
    const points = segments.map(p => ({ x: THEME.boardX + (p.x + 0.5) * cs, y: THEME.boardY + (p.y + 0.5) * cs }));
    const headAngle = { [Direction.UP]: -Math.PI / 2, [Direction.DOWN]: Math.PI / 2, [Direction.LEFT]: Math.PI, [Direction.RIGHT]: 0 }[dir];
    // One shadow silhouette avoids dark seams where the round segments overlap.
    ctx.save();
    ctx.translate(-cs * 0.08, cs * 0.09);
    ctx.beginPath();
    for (const p of points) {
      ctx.moveTo(p.x + cs * 0.70, p.y);
      ctx.arc(p.x, p.y, cs * 0.70, 0, Math.PI * 2);
    }
    ctx.fillStyle = THEME.snakeShadow;
    ctx.fill();
    ctx.restore();
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      let front = points[Math.max(0, i - 1)];
      // A growing tail can share its center with the preceding segment.
      // Use the nearest distinct point to retain its direction at that instant.
      if (i === points.length - 1 && i > 0) {
        for (let j = i - 1; j >= 0; j--) {
          front = points[j];
          if (Math.hypot(p.x - front.x, p.y - front.y) > 0.001) break;
        }
      }
      const back = points[i + 1];
      // The local tangent makes the lime pattern diagonal at corners.
      const angle = i === 0 ? headAngle : back
        ? Math.atan2(front.y - back.y, front.x - back.x)
        : Math.atan2(p.y - front.y, p.x - front.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      if (i === points.length - 1 && i > 0) this.drawTaperedTail(ctx);
      if (i === 0) this.drawHead(ctx);
      else this.drawBodySegment(ctx);
      ctx.restore();
    }
  }

  private drawBodySegment(ctx: CanvasRenderingContext2D): void {
    const cs = THEME.cellSize;
    ctx.beginPath();
    ctx.arc(0, 0, cs * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = THEME.snakeMain;
    ctx.fill();
    ctx.strokeStyle = THEME.snakeOutline;
    ctx.lineWidth = cs * 0.12;
    ctx.stroke();
    ctx.strokeStyle = THEME.snakeLight;
    ctx.lineWidth = cs * 0.15;
    ctx.lineCap = 'round';
    for (const side of [-1, 0, 1]) {
      const halfLength = cs * (side === 0 ? 0.29 : 0.095);
      ctx.beginPath();
      ctx.moveTo(-halfLength, side * cs * 0.245);
      ctx.lineTo(halfLength, side * cs * 0.245);
      ctx.stroke();
    }
  }

  private drawTaperedTail(ctx: CanvasRenderingContext2D): void {
    const cs = THEME.cellSize;
    // Fixed length keeps the tip intact while new tail segments grow.
    ctx.beginPath();
    ctx.moveTo(0, -cs * 0.49);
    ctx.quadraticCurveTo(cs * 0.82, -cs * 0.28, cs * 1.38, 0);
    ctx.quadraticCurveTo(cs * 0.82, cs * 0.28, 0, cs * 0.49);
    ctx.closePath();
    ctx.fillStyle = THEME.snakeMain;
    ctx.fill();
    ctx.lineWidth = cs * 0.12;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = THEME.snakeOutline;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cs * 0.48, 0);
    ctx.lineTo(cs * 1.02, 0);
    ctx.lineWidth = cs * 0.15;
    ctx.lineCap = 'round';
    ctx.strokeStyle = THEME.snakeLight;
    ctx.stroke();
  }

  private drawHead(ctx: CanvasRenderingContext2D): void {
    const cs = THEME.cellSize;
    ctx.beginPath();
    ctx.ellipse(cs * 0.08, 0, cs * 0.53, cs * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = THEME.snakeLight;
    ctx.fill();
    ctx.lineWidth = cs * 0.11;
    ctx.strokeStyle = THEME.snakeOutline;
    ctx.stroke();
    ctx.fillStyle = THEME.snakeMain;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cs * 0.42, side * cs * 0.30, cs * 0.12, cs * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Oversized eyes sit behind the snout and look along the travel direction.
    for (const side of [-1, 1]) {
      const ex = -cs * 0.48;
      const ey = side * cs * 0.38;
      ctx.beginPath();
      ctx.arc(ex, ey, cs * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = '#101510';
      ctx.lineWidth = cs * 0.095;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + cs * 0.13, ey - side * cs * 0.035, cs * 0.185, 0, Math.PI * 2);
      ctx.fillStyle = '#050805';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + cs * 0.08, ey - cs * 0.06, cs * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  }
  // --------------------------------------------------------------------------
  // IMPACT VFX: Multi-Point Star Burst & Particle Sparks
  // --------------------------------------------------------------------------
  private renderImpactVFX(
    ctx: CanvasRenderingContext2D,
    impactStar: { x: number; y: number; scale: number; alpha: number } | null,
    particles: ImpactParticle[]
  ): void {
    // 1. White Multi-Point Star Impact Burst
    if (impactStar && impactStar.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = impactStar.alpha;
      ctx.translate(impactStar.x, impactStar.y);
      const starR = THEME.cellSize * 1.5 * impactStar.scale;

      ctx.beginPath();
      const points = 8;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? starR : starR * 0.35;
        const angle = (i * Math.PI) / points;
        const sx = Math.cos(angle) * r;
        const sy = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }

    // 2. Flying Impact Spark Particles
    for (const p of particles) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // PAUSED OVERLAY
  // --------------------------------------------------------------------------
  private renderPausedOverlay(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.fillStyle = 'rgba(20, 49, 78, 0.55)';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '900 32px Fredoka, Nunito, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.fillText('PAUSED', w / 2, h / 2 - 15);

    ctx.font = '700 16px Fredoka, Inter, sans-serif';
    ctx.fillStyle = THEME.boardLight;
    ctx.fillText('Tap anywhere to resume', w / 2, h / 2 + 25);
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // GAME OVER SCREEN: Dusty Mauve Card, Staggered Stat Rows, Home & Play Again
  // --------------------------------------------------------------------------
  public getGameOverBounds() {
    const w = this.width;
    const h = this.height;

    const cardW = Math.min(330, w - 36);
    const cardH = 430;
    const cardX = Math.round((w - cardW) / 2);
    const cardY = Math.round((h - cardH) / 2 - 10);

    const creamW = cardW - 36;
    const creamH = 200;
    const creamX = cardX + 18;
    const creamY = cardY + 160;

    const btnY = cardY + cardH + 18;
    const homeW = 54;
    const homeH = 54;
    const homeX = cardX;

    const playW = cardW - homeW - 14;
    const playH = 54;
    const playX = homeX + homeW + 14;

    return {
      cardX,
      cardY,
      cardW,
      cardH,
      creamX,
      creamY,
      creamW,
      creamH,
      homeX,
      homeY: btnY,
      homeW,
      homeH,
      playX,
      playY: btnY,
      playW,
      playH
    };
  }

  private renderGameOverCard(
    ctx: CanvasRenderingContext2D,
    difficulty: Difficulty,
    score: number,
    stats: ModeStats,
    overlayAlpha: number,
    animTime: number
  ): void {
    const w = this.width;
    const h = this.height;
    const b = this.getGameOverBounds();

    // 1. Dark Muted Backdrop with Radial Spotlight Rays
    ctx.save();
    ctx.fillStyle = `rgba(47, 48, 69, ${overlayAlpha * 0.94})`;
    ctx.fillRect(0, 0, w, h);

    // Faint subtle radial rays behind card
    if (overlayAlpha > 0.3) {
      const rayAlpha = Math.min(0.08, overlayAlpha * 0.08);
      ctx.fillStyle = `rgba(255, 255, 255, ${rayAlpha})`;
      const rayCenterY = b.cardY + b.cardH * 0.4;
      const numRays = 16;
      for (let i = 0; i < numRays; i++) {
        const a1 = (i * 2 * Math.PI) / numRays;
        const a2 = a1 + (Math.PI / numRays) * 0.6;
        ctx.beginPath();
        ctx.moveTo(w / 2, rayCenterY);
        ctx.arc(w / 2, rayCenterY, Math.max(w, h), a1, a2);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 2. Dusty Mauve Main Result Card
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    (ctx as any).roundRect(b.cardX, b.cardY, b.cardW, b.cardH, 28);
    ctx.fillStyle = THEME.resultCardBg;
    ctx.fill();
    ctx.restore();

    // "GAME OVER" Title
    ctx.save();
    ctx.font = '900 32px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFE5D7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 4;
    ctx.fillText('GAME OVER', b.cardX + b.cardW / 2, b.cardY + 28);

    // "Score" Subtitle in Peach
    ctx.font = '700 18px Fredoka, Inter, sans-serif';
    ctx.fillStyle = THEME.scorePeach;
    ctx.fillText('Score', b.cardX + b.cardW / 2, b.cardY + 76);

    // Big Score Number
    ctx.font = '900 48px Fredoka, Nunito, sans-serif';
    ctx.fillStyle = THEME.scorePeach;
    ctx.fillText(String(score), b.cardX + b.cardW / 2, b.cardY + 98);
    ctx.restore();

    // 3. Cream Rounded Badge Box
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(b.creamX, b.creamY, b.creamW, b.creamH, 20);
    ctx.fillStyle = THEME.resultCreamBox;
    ctx.fill();

    // Mode Banner Header inside cream box: [ DIFFICULTY  (Face)  MODE ]
    const modeHeaderY = b.creamY + 24;
    this.renderModeEmblemHeader(ctx, b.creamX + b.creamW / 2, modeHeaderY, difficulty);

    // 4. Staggered Sequential Stat Pill Rows
    // Row 1: Today's best (Yellow/Gold) -> delay 0.15s
    // Row 2: Week's best (Pink) -> delay 0.35s
    // Row 3: All-time best (Aqua) -> delay 0.55s
    const rowH = 34;
    const rowGap = 8;
    const rowStartY = b.creamY + 54;
    const rowW = b.creamW - 24;
    const rowX = b.creamX + 12;

    const rows = [
      { label: "Today's best", score: stats.todayBest, color: THEME.goldText, delay: 0.15 },
      { label: "Week's best", score: stats.weekBest, color: THEME.pinkText, delay: 0.35 },
      { label: "All-time best", score: stats.allTimeBest, color: THEME.aquaText, delay: 0.55 }
    ];

    rows.forEach((r, idx) => {
      const rowY = rowStartY + idx * (rowH + rowGap);
      const rowAnimProgress = Math.max(0, Math.min(1, (animTime - r.delay) / 0.22));

      if (rowAnimProgress > 0) {
        ctx.save();
        ctx.globalAlpha = rowAnimProgress;

        // Subtle scale 0.9 -> 1.0
        const scale = 0.9 + 0.1 * rowAnimProgress;
        ctx.translate(rowX + rowW / 2, rowY + rowH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(rowX + rowW / 2), -(rowY + rowH / 2));

        // Dark mauve pill background
        ctx.beginPath();
        (ctx as any).roundRect(rowX, rowY, rowW, rowH, rowH / 2);
        ctx.fillStyle = THEME.statPillBg;
        ctx.fill();

        // Trophy Icon
        this.drawTrophy(ctx, rowX + 16, rowY + rowH / 2, 16, r.color);

        // Label
        ctx.font = '700 14px Fredoka, Inter, sans-serif';
        ctx.fillStyle = r.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.label, rowX + 34, rowY + rowH / 2);

        // Score aligned on the right
        ctx.font = '900 17px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(r.score), rowX + rowW - 14, rowY + rowH / 2);

        ctx.restore();
      }
    });

    ctx.restore();

    // 5. Action Buttons: Coral Home Button & Green PLAY AGAIN Button
    // Home Button
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(b.homeX, b.homeY, b.homeW, b.homeH, 16);
    ctx.fillStyle = THEME.homeButton;
    ctx.fill();
    ctx.restore();

    // White House Icon
    this.drawHomeIcon(ctx, b.homeX + b.homeW / 2, b.homeY + b.homeH / 2, 22, '#FFFFFF');

    // PLAY AGAIN Button
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(b.playX, b.playY, b.playW, b.playH, 16);
    ctx.fillStyle = THEME.playAgainButton;
    ctx.fill();
    ctx.restore();

    // PLAY AGAIN Label
    ctx.save();
    ctx.font = '900 20px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN', b.playX + b.playW / 2, b.playY + b.playH / 2);
    ctx.restore();
  }

  // Draw trophy icon in stat row
  private drawTrophy(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;

    // Cup
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.15, size * 0.32, 0, Math.PI);
    ctx.lineTo(cx + size * 0.32, cy - size * 0.35);
    ctx.lineTo(cx - size * 0.32, cy - size * 0.35);
    ctx.closePath();
    ctx.fill();

    // Handles
    ctx.beginPath();
    ctx.arc(cx - size * 0.34, cy - size * 0.2, size * 0.14, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + size * 0.34, cy - size * 0.2, size * 0.14, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // Stem & Base
    ctx.fillRect(cx - size * 0.07, cy + size * 0.16, size * 0.14, size * 0.16);
    ctx.fillRect(cx - size * 0.22, cy + size * 0.32, size * 0.44, size * 0.1);
    ctx.restore();
  }

  // Draw white house icon
  private drawHomeIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Roof
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.45, cy);
    ctx.lineTo(cx, cy - size * 0.42);
    ctx.lineTo(cx + size * 0.45, cy);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.fillRect(cx - size * 0.32, cy, size * 0.64, size * 0.42);

    // Door
    ctx.fillStyle = THEME.homeButton;
    ctx.fillRect(cx - size * 0.1, cy + size * 0.12, size * 0.2, size * 0.3);
    ctx.restore();
  }

  // Draw mode banner header with character badge inside cream box
  private renderModeEmblemHeader(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    diff: Difficulty
  ): void {
    const diffConfig = DIFFICULTIES.find(d => d.id === diff) || DIFFICULTIES[0];
    const label = diffConfig.label;

    ctx.save();
    ctx.font = '900 16px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = diffConfig.color;
    ctx.textBaseline = 'middle';

    // Left word: DIFFICULTY (e.g. MEDIUM)
    ctx.textAlign = 'right';
    ctx.fillText(label, cx - 22, cy);

    // Right word: MODE
    ctx.textAlign = 'left';
    ctx.fillText('MODE', cx + 22, cy);

    drawDifficultyEmoji(ctx, diffConfig.emblem, cx, cy, 22);

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // 4-IN-A-ROW STYLE DIFFICULTY SELECTION MODAL
  // --------------------------------------------------------------------------
  public getDifficultyDialogBounds() {
    const w = this.width;
    const h = this.height;
    const cardW = Math.min(336, w - 32);
    const cardH = 370;
    const cardX = Math.round((w - cardW) / 2);
    const cardY = Math.round(Math.max(30, (h - cardH) / 2));

    const trackW = cardW - 64;
    const trackH = 12;
    const trackX = cardX + 32;
    const trackY = cardY + 205;
    const knobR = 14;

    const playW = cardW - 56;
    const playH = 48;
    const playX = cardX + 28;
    const playY = cardY + 285;

    return { cardX, cardY, cardW, cardH, trackX, trackY, trackW, trackH, knobR, playX, playY, playW, playH };
  }

  public renderDifficultyDialog(ctx: CanvasRenderingContext2D, sliderPos: number): void {
    const w = this.width;
    const h = this.height;

    // Clean neutral dimming overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const bounds = this.getDifficultyDialogBounds();
    const curIdx = Math.max(0, Math.min(2, Math.round(sliderPos)));
    const d = DIFFICULTIES[curIdx];

    // Card background: clean white with soft neutral shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.cardX, bounds.cardY, bounds.cardW, bounds.cardH, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    // Close button (X) top right
    const closeX = bounds.cardX + bounds.cardW - 24;
    const closeY = bounds.cardY + 26;
    ctx.save();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(closeX - 6, closeY - 6);
    ctx.lineTo(closeX + 6, closeY + 6);
    ctx.moveTo(closeX + 6, closeY - 6);
    ctx.lineTo(closeX - 6, closeY + 6);
    ctx.stroke();
    ctx.restore();

    // Dialog Header Title
    ctx.save();
    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', bounds.cardX + bounds.cardW / 2, bounds.cardY + 36);

    // Center Emblem Badge with Real Emoji
    const emblemY = bounds.cardY + 95;
    const emblemR = 36;

    ctx.save();
    ctx.beginPath();
    ctx.arc(bounds.cardX + bounds.cardW / 2, emblemY, emblemR, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    drawDifficultyEmoji(ctx, d.emblem, bounds.cardX + bounds.cardW / 2, emblemY, 40);
    ctx.restore();

    // Difficulty Tier Label (EASY / MEDIUM / HARD)
    ctx.font = '900 24px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = d.color;
    ctx.textAlign = 'center';
    ctx.fillText(d.label, bounds.cardX + bounds.cardW / 2, bounds.cardY + 165);

    // Slider Track
    const usableW = bounds.trackW - 2 * bounds.knobR;
    const knobX = bounds.trackX + bounds.knobR + (sliderPos / 2) * usableW;

    ctx.beginPath();
    (ctx as any).roundRect(bounds.trackX, bounds.trackY, bounds.trackW, bounds.trackH, bounds.trackH / 2);
    ctx.fillStyle = '#E2E8F0';
    ctx.fill();

    // Active Gradient Track
    const activeW = Math.max(bounds.trackH, knobX - bounds.trackX + bounds.knobR);
    const trackGrad = ctx.createLinearGradient(bounds.trackX, 0, bounds.trackX + bounds.trackW, 0);
    trackGrad.addColorStop(0, '#22C55E');
    trackGrad.addColorStop(0.5, '#F59E0B');
    trackGrad.addColorStop(1, '#EF4444');

    ctx.beginPath();
    (ctx as any).roundRect(bounds.trackX, bounds.trackY, activeW, bounds.trackH, bounds.trackH / 2);
    ctx.fillStyle = trackGrad;
    ctx.fill();

    // Slider Knob with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(knobX, bounds.trackY + bounds.trackH / 2, bounds.knobR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(knobX, bounds.trackY + bounds.trackH / 2, bounds.knobR - 4, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.restore();

    // Labels under slider
    ctx.save();
    ctx.font = '700 11px Fredoka, Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.fillText('EASY', bounds.trackX + bounds.knobR, bounds.trackY + 28);
    ctx.fillText('MEDIUM', bounds.trackX + bounds.trackW / 2, bounds.trackY + 28);
    ctx.fillText('HARD', bounds.trackX + bounds.trackW - bounds.knobR, bounds.trackY + 28);

    // [ PLAY ▶ ] Button
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.playX, bounds.playY, bounds.playW, bounds.playH, 18);
    ctx.fillStyle = d.color;
    ctx.fill();

    const btnCenterX = bounds.playX + bounds.playW / 2;
    const btnCenterY = bounds.playY + bounds.playH / 2;

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY', btnCenterX - 8, btnCenterY);

    // Crisp vector play arrow
    ctx.beginPath();
    const triX = btnCenterX + 22;
    ctx.moveTo(triX - 4, btnCenterY - 6);
    ctx.lineTo(triX + 6, btnCenterY);
    ctx.lineTo(triX - 4, btnCenterY + 6);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // FLOATING SEMI-TRANSPARENT CUTE VIRTUAL JOYSTICK
  // --------------------------------------------------------------------------
  public renderJoystick(
    ctx: CanvasRenderingContext2D,
    knobX: number,
    knobY: number,
    isJoyActive: boolean,
    joyDir: Direction | null,
    joyYOverride?: number
  ): void {
    const jx = THEME.joyX;
    const jy = joyYOverride !== undefined ? joyYOverride : THEME.joyY;
    const baseR = THEME.joyRadius;
    const knobR = THEME.joyKnobRadius;

    ctx.save();

    // 1. Semi-transparent Cute Floating Glass Base Disc
    ctx.shadowColor = 'rgba(20, 49, 78, 0.20)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.arc(jx, jy, baseR, 0, Math.PI * 2);
    const bgGrad = ctx.createRadialGradient(jx, jy, 2, jx, jy, baseR);
    bgGrad.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
    bgGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.20)');
    bgGrad.addColorStop(1, 'rgba(240, 248, 255, 0.12)');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2.0;
    ctx.stroke();
    ctx.restore();

    // 2. Cute Directional Indicators (▲, ▼, ◀, ▶)
    const dOffset = baseR * 0.62;
    const dirIndicators = [
      { dir: Direction.UP, text: '▲', x: jx, y: jy - dOffset },
      { dir: Direction.DOWN, text: '▼', x: jx, y: jy + dOffset },
      { dir: Direction.LEFT, text: '◀', x: jx - dOffset, y: jy },
      { dir: Direction.RIGHT, text: '▶', x: jx + dOffset, y: jy }
    ];

    ctx.save();
    for (const ind of dirIndicators) {
      const isHighlighted = isJoyActive && joyDir === ind.dir;
      ctx.font = `${isHighlighted ? '900' : '800'} ${isHighlighted ? '14px' : '11px'} Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isHighlighted) {
        ctx.fillStyle = '#83CC43';
        ctx.shadowColor = 'rgba(131, 204, 67, 0.85)';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(ind.text, ind.x, ind.y);
    }
    ctx.restore();

    // 3. Inner Draggable Thumb Knob (Semi-transparent Floating Cute Disc)
    const kx = knobX;
    const ky = knobY;

    ctx.save();
    if (isJoyActive) {
      ctx.shadowColor = 'rgba(131, 204, 67, 0.55)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 3;
    } else {
      ctx.shadowColor = 'rgba(20, 49, 78, 0.22)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
    }

    ctx.beginPath();
    ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
    const kGrad = ctx.createRadialGradient(kx - 3, ky - 3, 2, kx, ky, knobR);
    kGrad.addColorStop(0, 'rgba(255, 255, 255, 0.90)');
    kGrad.addColorStop(0.7, 'rgba(240, 248, 255, 0.72)');
    kGrad.addColorStop(1, 'rgba(224, 242, 254, 0.55)');
    ctx.fillStyle = kGrad;
    ctx.fill();

    ctx.strokeStyle = isJoyActive ? '#83CC43' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = isJoyActive ? 2.5 : 1.8;
    ctx.stroke();

    // Cute Snake-Green Center Dot with subtle sparkle
    ctx.beginPath();
    ctx.arc(kx, ky, 6, 0, Math.PI * 2);
    ctx.fillStyle = isJoyActive ? '#83CC43' : '#A3E635';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(kx - 1.8, ky - 1.8, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.restore();
  }
}
