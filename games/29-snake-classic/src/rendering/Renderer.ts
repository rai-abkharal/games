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

  public resize(): void {
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

    updateLayout(w, h);
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
    gameOverAnimTime: number
  ): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Full-Bleed Sky Blue Background
    ctx.fillStyle = THEME.bgSky;
    ctx.fillRect(0, 0, w, h);

    // 2. Top Header HUD (Back, Badges, Pause)
    this.renderTopHUD(ctx, difficulty, score, liveAllTime);

    // 3. Playable Arena (Dark Navy Frame + Checkerboard)
    this.renderArena(ctx);

    // 4. Red Food Items
    this.renderFoods(ctx, foods);

    // 5. Snake (Tail -> Body -> Cartoon Head)
    this.renderSnake(ctx, segments, currentDir);

    // 6. Impact Star & Burst Particles
    this.renderImpactVFX(ctx, impactStar, impactParticles);

    // 7. Paused Screen Overlay
    if (state === GameState.PAUSED) {
      this.renderPausedOverlay(ctx);
    }

    // 8. Game Over / Result Card Transition & Screen
    if (state === GameState.RESULT_TRANSITION || state === GameState.GAME_OVER) {
      this.renderGameOverCard(ctx, difficulty, score, stats, overlayAlpha, gameOverAnimTime);
    }

    // 9. Difficulty Selection Modal
    if (state === GameState.DIFF_SELECT) {
      this.renderDifficultyDialog(ctx, sliderPos);
    }
  }

  // --------------------------------------------------------------------------
  // TOP BAR HUD: Back Button, Mode/Score, Crown All-Time, Pause Button
  // --------------------------------------------------------------------------
  private renderTopHUD(
    ctx: CanvasRenderingContext2D,
    difficulty: Difficulty,
    score: number,
    liveAllTime: number
  ): void {
    const diffConfig = DIFFICULTIES.find(d => d.id === difficulty) || DIFFICULTIES[0];

    // 1. Top-Left Back Button (White circle, pink chevron)
    const back = THEME.backBtn;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(back.x, back.y, back.r, 0, Math.PI * 2);
    ctx.fillStyle = THEME.uiWhite;
    ctx.fill();
    ctx.restore();

    // Pink left chevron (<)
    ctx.save();
    ctx.strokeStyle = THEME.uiPinkChevron;
    ctx.lineWidth = Math.max(3.5, back.r * 0.18);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const arrSize = back.r * 0.38;
    ctx.moveTo(back.x + arrSize * 0.45, back.y - arrSize);
    ctx.lineTo(back.x - arrSize * 0.45, back.y);
    ctx.lineTo(back.x + arrSize * 0.45, back.y + arrSize);
    ctx.stroke();
    ctx.restore();

    // 2. Center-Left Mode & Score Badge
    const mb = THEME.modeBadge;
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(mb.x, mb.y, mb.w, mb.h, mb.r);
    ctx.fillStyle = THEME.headerBadgeBg;
    ctx.fill();

    // Mode Title
    ctx.font = `800 ${Math.round(mb.h * 0.26)}px Fredoka, Inter, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(diffConfig.badgeLabel, mb.x + mb.w / 2, mb.y + mb.h * 0.33);

    // Current Score
    ctx.font = `900 ${Math.round(mb.h * 0.42)}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(String(score), mb.x + mb.w / 2, mb.y + mb.h * 0.72);
    ctx.restore();

    // 3. Center-Right Crown All-Time Badge
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

    // 4. Top-Right Pause Button (White circle, pink pause bars)
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
  // FOOD COLLECTIBLES: Red Circular Fruit Tokens with Drop Shadow and Center Seed
  // --------------------------------------------------------------------------
  private renderFoods(ctx: CanvasRenderingContext2D, foods: FoodItem[]): void {
    const cs = THEME.cellSize;
    const radius = cs * 0.42;

    for (const food of foods) {
      const px = THEME.boardX + (food.x + 0.5) * cs;
      const py = THEME.boardY + (food.y + 0.5) * cs;

      // Drop shadow (bottom-right)
      ctx.save();
      ctx.beginPath();
      ctx.arc(px + cs * 0.07, py + cs * 0.08, radius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.foodShadow;
      ctx.fill();
      ctx.restore();

      // Outer dark rim
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.foodBase;
      ctx.fill();
      ctx.lineWidth = Math.max(2, cs * 0.09);
      ctx.strokeStyle = THEME.foodOutline;
      ctx.stroke();

      // Inner center seed (dark teardrop / circle)
      const seedR = radius * 0.32;
      ctx.beginPath();
      ctx.arc(px, py, seedR, 0, Math.PI * 2);
      ctx.fillStyle = THEME.foodSeed;
      ctx.fill();

      // Tiny green highlight speck/stem at the top of seed
      ctx.beginPath();
      ctx.arc(px, py - seedR * 0.65, seedR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = THEME.foodStem;
      ctx.fill();

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // SNAKE RENDERING: Smoothly Interpolated Segments, Big Cartoon Eyes, Pointed Tail
  // --------------------------------------------------------------------------
  private renderSnake(
    ctx: CanvasRenderingContext2D,
    segments: VisualPos[],
    dir: Direction
  ): void {
    if (segments.length === 0) return;

    const cs = THEME.cellSize;
    const segRadius = cs * 0.44;

    // Convert all segment positions to pixel coordinates
    const pixelPoints = segments.map(s => ({
      x: THEME.boardX + (s.x + 0.5) * cs,
      y: THEME.boardY + (s.y + 0.5) * cs
    }));

    // 1. Snake Under-Shadow (Soft translucent shadow offset to bottom-right)
    ctx.save();
    for (let i = pixelPoints.length - 1; i >= 0; i--) {
      const pt = pixelPoints[i];
      ctx.beginPath();
      ctx.arc(pt.x + cs * 0.08, pt.y + cs * 0.09, segRadius, 0, Math.PI * 2);
      ctx.fillStyle = THEME.snakeShadow;
      ctx.fill();
    }
    ctx.restore();

    // 2. Draw Segments from Tail to Head
    for (let i = pixelPoints.length - 1; i >= 0; i--) {
      const pt = pixelPoints[i];
      const isHead = i === 0;
      const isTail = i === pixelPoints.length - 1;

      if (isTail && pixelPoints.length > 1) {
        // Pointed Tail Segment
        const prevPt = pixelPoints[i - 1];
        this.drawTaperedTail(ctx, pt, prevPt, segRadius);
      } else if (!isHead) {
        // Body Segment: Bright green circle with dark border & light green inner oval
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, segRadius, 0, Math.PI * 2);
        ctx.fillStyle = THEME.snakeMain;
        ctx.fill();
        ctx.lineWidth = Math.max(2, cs * 0.08);
        ctx.strokeStyle = THEME.snakeOutline;
        ctx.stroke();

        // Inner lighter green oval dorsal mark
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, segRadius * 0.48, segRadius * 0.48, 0, 0, Math.PI * 2);
        ctx.fillStyle = THEME.snakeLight;
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Draw Head with Oversized Cartoon Eyes & Cute Expression
    const headPt = pixelPoints[0];
    this.drawHead(ctx, headPt, dir, segRadius);
  }

  // Draw tapered pointed tail
  private drawTaperedTail(
    ctx: CanvasRenderingContext2D,
    tailPt: { x: number; y: number },
    prevPt: { x: number; y: number },
    radius: number
  ): void {
    const dx = tailPt.x - prevPt.x;
    const dy = tailPt.y - prevPt.y;
    const angle = Math.atan2(dy, dx);
    const cs = THEME.cellSize;

    ctx.save();
    ctx.translate(tailPt.x, tailPt.y);
    ctx.rotate(angle);

    // Tail leaf/wedge geometry pointing backwards (+X in local rotated space)
    ctx.beginPath();
    ctx.moveTo(-radius * 0.3, -radius * 0.9);
    ctx.quadraticCurveTo(radius * 0.4, -radius * 0.7, radius * 1.35, 0);
    ctx.quadraticCurveTo(radius * 0.4, radius * 0.7, -radius * 0.3, radius * 0.9);
    ctx.closePath();

    ctx.fillStyle = THEME.snakeMain;
    ctx.fill();
    ctx.lineWidth = Math.max(2, cs * 0.08);
    ctx.strokeStyle = THEME.snakeOutline;
    ctx.stroke();

    // Central leaf spine / light green vein
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * 0.9, 0);
    ctx.strokeStyle = THEME.snakeLight;
    ctx.lineWidth = Math.max(2, cs * 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  // Draw cute cartoon head with oversized expressive eyes
  private drawHead(
    ctx: CanvasRenderingContext2D,
    pt: { x: number; y: number },
    dir: Direction,
    radius: number
  ): void {
    const cs = THEME.cellSize;

    // Head base circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = THEME.snakeMain;
    ctx.fill();
    ctx.lineWidth = Math.max(2, cs * 0.085);
    ctx.strokeStyle = THEME.snakeOutline;
    ctx.stroke();

    // Inner subtle forehead mark
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = THEME.snakeLight;
    ctx.fill();

    // Oversized cartoon eyes!
    // Compute eye offsets based on movement direction
    let eye1X = 0, eye1Y = 0, eye2X = 0, eye2Y = 0;
    let pupilDx = 0, pupilDy = 0;
    const eyeR = radius * 0.52;
    const pupilR = eyeR * 0.45;
    const eyeSeparation = radius * 0.48;

    switch (dir) {
      case Direction.UP:
        eye1X = -eyeSeparation;
        eye1Y = -radius * 0.15;
        eye2X = eyeSeparation;
        eye2Y = -radius * 0.15;
        pupilDx = 0;
        pupilDy = -eyeR * 0.35;
        break;
      case Direction.DOWN:
        eye1X = -eyeSeparation;
        eye1Y = radius * 0.15;
        eye2X = eyeSeparation;
        eye2Y = radius * 0.15;
        pupilDx = 0;
        pupilDy = eyeR * 0.35;
        break;
      case Direction.LEFT:
        eye1X = -radius * 0.15;
        eye1Y = -eyeSeparation;
        eye2X = -radius * 0.15;
        eye2Y = eyeSeparation;
        pupilDx = -eyeR * 0.35;
        pupilDy = 0;
        break;
      case Direction.RIGHT:
        eye1X = radius * 0.15;
        eye1Y = -eyeSeparation;
        eye2X = radius * 0.15;
        eye2Y = eyeSeparation;
        pupilDx = eyeR * 0.35;
        pupilDy = 0;
        break;
    }

    const eyes = [
      { x: pt.x + eye1X, y: pt.y + eye1Y },
      { x: pt.x + eye2X, y: pt.y + eye2Y }
    ];

    for (const e of eyes) {
      // White eye sphere with black border
      ctx.beginPath();
      ctx.arc(e.x, e.y, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = Math.max(1.8, cs * 0.075);
      ctx.strokeStyle = '#0F172A';
      ctx.stroke();

      // Black cartoon pupil
      ctx.beginPath();
      ctx.arc(e.x + pupilDx, e.y + pupilDy, pupilR, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Tiny white eye glint reflection
      ctx.beginPath();
      ctx.arc(e.x + pupilDx - pupilR * 0.3, e.y + pupilDy - pupilR * 0.35, pupilR * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }

    ctx.restore();
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

    // Center Emoji/Character Emblem
    const charR = 14;
    if (diff === Difficulty.Hard) {
      // Red devil face with horns & crown
      this.drawCrown(ctx, cx, cy - charR + 2, 18, '#EF4444');
      ctx.beginPath();
      ctx.arc(cx, cy, charR, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444';
      ctx.fill();

      // Devil eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 1, 3, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx - 3.5, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (diff === Difficulty.Medium) {
      // Yellow face with sunglasses & crown
      this.drawCrown(ctx, cx, cy - charR + 2, 18, '#F59E0B');
      ctx.beginPath();
      ctx.arc(cx, cy, charR, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();

      // Cool sunglasses
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      (ctx as any).roundRect(cx - 9, cy - 3, 8, 6, 2);
      (ctx as any).roundRect(cx + 1, cy - 3, 8, 6, 2);
      ctx.fill();
      ctx.fillRect(cx - 2, cy - 2, 4, 2);
    } else {
      // Green smiling face with sprout
      this.drawCrown(ctx, cx, cy - charR + 2, 18, '#22C55E');
      ctx.beginPath();
      ctx.arc(cx, cy, charR, 0, Math.PI * 2);
      ctx.fillStyle = '#22C55E';
      ctx.fill();

      // Smile
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2, 2, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 5, 0, Math.PI);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }

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

    // Close button (✕) top right
    ctx.save();
    ctx.font = '700 18px Fredoka, Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', bounds.cardX + bounds.cardW - 24, bounds.cardY + 26);
    ctx.restore();

    // Dialog Header Title
    ctx.save();
    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', bounds.cardX + bounds.cardW / 2, bounds.cardY + 36);

    // Center Vector Emblem Badge
    const emblemY = bounds.cardY + 95;
    const emblemR = 36;

    ctx.beginPath();
    ctx.arc(bounds.cardX + bounds.cardW / 2, emblemY, emblemR, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawEmblem(ctx, bounds.cardX + bounds.cardW / 2, emblemY, d.emblem, d.color);

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
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.playX, bounds.playY, bounds.playW, bounds.playH, 18);
    ctx.fillStyle = d.color;
    ctx.fill();

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY ▶', bounds.playX + bounds.playW / 2, bounds.playY + bounds.playH / 2);
    ctx.restore();
  }

  // Draw Difficulty Emblems (Sprout, Sunglasses, Devil)
  private drawEmblem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    type: 'sprout' | 'sunglasses' | 'devil',
    color: string
  ): void {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'sprout') {
      // Leaf / Sprout
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.quadraticCurveTo(x, y, x - 12, y - 4);
      ctx.quadraticCurveTo(x - 6, y - 14, x, y - 6);
      ctx.quadraticCurveTo(x + 6, y - 14, x + 12, y - 4);
      ctx.quadraticCurveTo(x, y, x, y + 14);
      ctx.fill();
    } else if (type === 'sunglasses') {
      // Spark / Lightning
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 16);
      ctx.lineTo(x - 9, y - 1);
      ctx.lineTo(x - 1, y - 1);
      ctx.lineTo(x - 4, y + 16);
      ctx.lineTo(x + 9, y + 1);
      ctx.lineTo(x + 1, y + 1);
      ctx.closePath();
      ctx.fill();
    } else {
      // Flame / Devil
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.quadraticCurveTo(x + 15, y - 4, x + 11, y + 8);
      ctx.quadraticCurveTo(x + 8, y + 16, x, y + 16);
      ctx.quadraticCurveTo(x - 8, y + 16, x - 11, y + 8);
      ctx.quadraticCurveTo(x - 15, y - 4, x, y - 16);
      ctx.fill();
    }
    ctx.restore();
  }
}
