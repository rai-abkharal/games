import {
  ROWS,
  COLS,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  Cell,
  GameState,
  Difficulty,
  DIFFICULTIES,
  DifficultyConfig,
  CellPosition,
  FallingPiece,
  PreviewPiece
} from '../game/Types.js';
import { THEME } from './Theme.js';
import { SoundSynth } from '../audio/SoundSynth.js';

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

  public width: number = DESIGN_WIDTH;
  public height: number = DESIGN_HEIGHT;
  public scale: number = 1;
  public offsetX: number = 0;
  public offsetY: number = 0;
  public dpr: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to obtain 2D canvas context');
    this.ctx = context;
  }

  // Multi-DPI Canvas Resizing for 100% Crisp Retina & Android Screens (No Blur)
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

    this.scale = Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT);
    this.offsetX = (w - DESIGN_WIDTH * this.scale) / 2;
    this.offsetY = (h - DESIGN_HEIGHT * this.scale) / 2;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  public toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale
    };
  }

  // Main Render Routine
  public render(
    state: GameState,
    board: Cell[][],
    difficulty: Difficulty,
    sliderPos: number,
    turnProgress: number, // 0 = Player (Coral), 1 = Bot (Cyan)
    yourTurnProgress: number, // 0 to 1 for "Your turn" entrance/fade
    botThinkingTime: number,
    fallingPiece: FallingPiece | null,
    previewPiece: PreviewPiece,
    winningCells: CellPosition[] | null,
    winLineProgress: number,
    resultOverlayOpacity: number,
    winner: Cell | null,
    synth: SoundSynth
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Clear whole screen
    ctx.save();
    ctx.fillStyle = '#0F141A';
    ctx.fillRect(0, 0, w, h);

    // Apply viewport transform (Centered 384x850 virtual space)
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 1. Animated Background Crossfade
    this.renderBackground(ctx, turnProgress);

    // 2. HUD: "Your turn" bottom circle or "Bot thinking" top panel
    this.renderHUD(ctx, state, yourTurnProgress, botThinkingTime);

    // 3. Board Elements (With Physical Front-Plate Hole Masking)
    this.renderBoardHolesBackground(ctx);
    this.renderSettledPieces(ctx, board);

    // 4. Falling Piece (Renders Behind Front Plate)
    if (fallingPiece) {
      this.renderDisc(ctx, fallingPiece.x, fallingPiece.y, fallingPiece.player, 1.0);
    }

    // 5. Board Front Plate with 42 Transparent Holes Cut Out (Even-Odd Fill)
    this.renderBoardFrontPlate(ctx);

    // 6. Black Rims around all 42 holes
    this.renderHoleOutlines(ctx);

    // 7. Preview Aiming Piece Above Board
    if (previewPiece.visible && (state === GameState.PLAYER_AIMING || state === GameState.PLAYER_TURN_INTRO)) {
      this.renderDisc(ctx, previewPiece.x, previewPiece.y, Cell.Player, 1.0, true);
    }

    // 8. Winning Animated White Line
    if (winningCells && winningCells.length >= 4 && winLineProgress > 0) {
      this.renderWinningLine(ctx, winningCells, winLineProgress);
    }

    // 9. Top Navigation Header & Sudoku Pro Difficulty Pill
    this.renderHeader(ctx, difficulty, synth);

    // 10. Result Overlay Screen
    if (resultOverlayOpacity > 0) {
      this.renderResultScreen(ctx, winner, resultOverlayOpacity);
    }

    // 11. Sudoku Pro Style "SELECT DIFFICULTY" Modal
    if (state === GameState.DIFF_SELECT) {
      this.renderDifficultyDialog(ctx, sliderPos);
    } else if (state === GameState.TUTORIAL) {
      this.renderTutorialModal(ctx);
    }

    ctx.restore();
  }

  // Smooth background color interpolation between Coral and Cyan
  private renderBackground(ctx: CanvasRenderingContext2D, turnProgress: number): void {
    // Coral: [253, 157, 115] -> Cyan: [90, 167, 212]
    const r = Math.round(253 + (90 - 253) * turnProgress);
    const g = Math.round(157 + (167 - 157) * turnProgress);
    const b = Math.round(115 + (212 - 115) * turnProgress);
    const bgColor = `rgb(${r}, ${g}, ${b})`;

    // Fill background with subtle depth gradient
    const grad = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT);
    grad.addColorStop(0, bgColor);
    grad.addColorStop(1, `rgba(${Math.max(0, r - 15)}, ${Math.max(0, g - 15)}, ${Math.max(0, b - 15)}, 1)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Subtle side sheen from reference video
    const sideSheen = ctx.createLinearGradient(0, 0, DESIGN_WIDTH, 0);
    sideSheen.addColorStop(0, 'rgba(0, 0, 0, 0.03)');
    sideSheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    sideSheen.addColorStop(1, 'rgba(0, 0, 0, 0.03)');
    ctx.fillStyle = sideSheen;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  // "Your turn" bottom circle & "Bot thinking" rounded panel
  private renderHUD(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    yourTurnProgress: number,
    botThinkingTime: number
  ): void {
    // 1. "Your turn" bottom circle animation
    if (yourTurnProgress > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, yourTurnProgress);

      const circleY = 840 - yourTurnProgress * 15;
      const circleR = 98;

      ctx.beginPath();
      ctx.arc(DESIGN_WIDTH / 2, circleY, circleR, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.font = '800 24px Fredoka, Nunito, Inter, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Your turn', DESIGN_WIDTH / 2, circleY - 32);
      ctx.restore();
    }

    // 2. "Bot thinking" rounded panel from reference video
    if (state === GameState.BOT_THINKING || state === GameState.BOT_DROPPING) {
      ctx.save();
      const panelX = 44;
      const panelY = 148;
      const panelW = 296;
      const panelH = 72;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      (ctx as any).roundRect(panelX, panelY, panelW, panelH, 20);
      ctx.fillStyle = 'rgba(28, 48, 70, 0.88)';
      ctx.fill();
      ctx.restore();

      // Animated pulsing dots
      const dotCount = Math.floor((botThinkingTime * 4) % 4);
      const dots = '.'.repeat(dotCount);

      ctx.save();
      ctx.font = '800 24px Fredoka, Nunito, Inter, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Bot thinking${dots}`, DESIGN_WIDTH / 2, panelY + panelH / 2);
      ctx.restore();
    }
  }

  // 42 Empty Hole Backings (Dark Gray)
  private renderBoardHolesBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = THEME.emptyHole;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.arc(THEME.slotCentersX[c], THEME.slotCentersY[r], THEME.slotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Stationary pieces committed to board
  private renderSettledPieces(ctx: CanvasRenderingContext2D, board: Cell[][]): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell !== Cell.Empty) {
          this.renderDisc(ctx, THEME.slotCentersX[c], THEME.slotCentersY[r], cell, 1.0);
        }
      }
    }
  }

  // Disc rendering with vibrant flat tone and subtle glossy bevel
  public renderDisc(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: Cell,
    alpha: number = 1.0,
    hasAimOutline: boolean = false
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    const color = player === Cell.Player ? THEME.playerDisc : THEME.botDisc;
    const r = THEME.slotRadius;

    // Disc fill
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Subtle glossy crescent highlight
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Heavy outline for preview aiming token
    if (hasAimOutline) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = THEME.holeOutline;
      ctx.lineWidth = THEME.slotOutlineWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  // The Magic Video Feature: Board Front Plate with 42 Holes Cut Out (Even-Odd Fill)
  private renderBoardFrontPlate(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.beginPath();

    // Outer Board Housing with rounded top corners
    (ctx as any).roundRect(
      THEME.boardX,
      THEME.boardY,
      THEME.boardW,
      THEME.boardH,
      [THEME.boardRadius, THEME.boardRadius, 10, 10]
    );

    // Cut out 42 transparent circular apertures
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.arc(THEME.slotCentersX[c], THEME.slotCentersY[r], THEME.slotRadius, 0, Math.PI * 2);
      }
    }

    ctx.fillStyle = THEME.boardFace;
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Heavy Black Outlines around each of the 42 slots
  private renderHoleOutlines(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = THEME.holeOutline;
    ctx.lineWidth = THEME.slotOutlineWidth;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.arc(THEME.slotCentersX[c], THEME.slotCentersY[r], THEME.slotRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // White animated winning line
  private renderWinningLine(
    ctx: CanvasRenderingContext2D,
    cells: CellPosition[],
    progress: number
  ): void {
    ctx.save();
    const startCell = cells[0];
    const endCell = cells[cells.length - 1];

    const startX = THEME.slotCentersX[startCell.col];
    const startY = THEME.slotCentersY[startCell.row];
    const targetEndX = THEME.slotCentersX[endCell.col];
    const targetEndY = THEME.slotCentersY[endCell.row];

    const currentEndX = startX + (targetEndX - startX) * progress;
    const currentEndY = startY + (targetEndY - startY) * progress;

    ctx.strokeStyle = THEME.white;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(currentEndX, currentEndY);
    ctx.stroke();
    ctx.restore();
  }

  // Top Header: Back Arrow, Sudoku Pro Difficulty Pill, Sound Toggle, and Restart
  private renderHeader(
    ctx: CanvasRenderingContext2D,
    difficulty: Difficulty,
    synth: SoundSynth
  ): void {
    const diffObj = DIFFICULTIES.find(d => d.id === difficulty) || DIFFICULTIES[0];

    // 1. Back Button (Top Left - Circular 50px)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(42, 62, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 26px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = THEME.playerDisc;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('‹', 41, 60);

    // 2. Sudoku Pro Difficulty Pill Button
    const pillX = 82;
    const pillY = 44;
    const pillW = 118;
    const pillH = 36;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    (ctx as any).roundRect(pillX, pillY, pillW, pillH, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Colored difficulty indicator dot
    ctx.beginPath();
    ctx.arc(pillX + 18, pillY + pillH / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = diffObj.color;
    ctx.fill();

    ctx.font = '800 13px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#1E293B';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${diffObj.label} ▼`, pillX + 30, pillY + pillH / 2);
    ctx.restore();

    // 3. Sound Button (Pill 44x36)
    const soundX = 212;
    const soundY = 44;
    const soundW = 46;
    const soundH = 36;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    (ctx as any).roundRect(soundX, soundY, soundW, soundH, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(synth.muted ? '🔇' : '🔊', soundX + soundW / 2, soundY + soundH / 2);
    ctx.restore();

    // 4. Restart Button (Top Right - Circular 50px)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(342, 62, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.font = '800 24px sans-serif';
    ctx.fillStyle = THEME.playerDisc;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↺', 342, 61);
  }

  // Translucent dark purple overlay and result popup
  private renderResultScreen(
    ctx: CanvasRenderingContext2D,
    winner: Cell | null,
    opacity: number
  ): void {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = THEME.resultOverlay;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Title: YOU WON! / YOU LOST! / DRAW!
    let title = 'YOU LOST!';
    let sub = 'The bot connected 4 in a row!';
    let titleColor = '#FFFFFF';

    if (winner === Cell.Player) {
      title = 'YOU WON!';
      sub = 'Brilliant! You connected 4 in a row!';
      titleColor = '#22C55E';
    } else if (winner === null) {
      title = 'DRAW!';
      sub = 'Full board! No one connected 4.';
      titleColor = '#F59E0B';
    }

    ctx.font = '900 52px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = titleColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 16;
    ctx.fillText(title, DESIGN_WIDTH / 2, 230);

    ctx.font = '700 16px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(sub, DESIGN_WIDTH / 2, 275);

    // Three Bottom Result Action Buttons
    // 1. Home (Coral Square)
    const btnY = 705;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(46, btnY, 58, 58, 16);
    ctx.fillStyle = THEME.btnHome;
    ctx.fill();
    ctx.restore();

    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏠', 46 + 29, btnY + 29);

    // 2. PLAY AGAIN (Wide Green Rectangle)
    ctx.save();
    ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(118, btnY, 148, 58, 16);
    ctx.fillStyle = THEME.btnPlayAgain;
    ctx.fill();
    ctx.restore();

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN ▶', 118 + 74, btnY + 29);

    // 3. Difficulty / Settings (Purple Square)
    ctx.save();
    ctx.shadowColor = 'rgba(139, 92, 246, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(280, btnY, 58, 58, 16);
    ctx.fillStyle = THEME.btnStats;
    ctx.fill();
    ctx.restore();

    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚙', 280 + 29, btnY + 29);

    ctx.restore();
  }

  // Exact Sudoku Pro Style "SELECT DIFFICULTY" Modal
  public getDifficultyDialogBounds() {
    const cardW = 328;
    const cardH = 430;
    const cardX = (DESIGN_WIDTH - cardW) / 2;
    const cardY = (DESIGN_HEIGHT - cardH) / 2 - 10;

    const trackW = 250;
    const trackH = 14;
    const trackX = (DESIGN_WIDTH - trackW) / 2;
    const trackY = cardY + 265;
    const knobR = 14;

    const playW = 190;
    const playH = 50;
    const playX = cardX + 24;
    const playY = cardY + 345;

    const qSize = 50;
    const qX = playX + playW + 16;
    const qY = playY;

    return { cardX, cardY, cardW, cardH, trackX, trackY, trackW, trackH, knobR, playX, playY, playW, playH, qX, qY, qSize };
  }

  public renderDifficultyDialog(ctx: CanvasRenderingContext2D, sliderPos: number): void {
    ctx.save();
    // Backdrop
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    const bounds = this.getDifficultyDialogBounds();
    const curIdx = Math.max(0, Math.min(2, Math.round(sliderPos)));
    const d = DIFFICULTIES[curIdx];

    // Card background
    ctx.shadowColor = 'rgba(15, 23, 42, 0.32)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.cardX, bounds.cardY, bounds.cardW, bounds.cardH, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    // Close button (X) top right of card
    ctx.save();
    ctx.font = '700 18px Fredoka, Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', bounds.cardX + bounds.cardW - 24, bounds.cardY + 26);
    ctx.restore();

    // Dialog Header Title
    ctx.font = '900 19px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', DESIGN_WIDTH / 2, bounds.cardY + 36);

    // Center Vector Emblem Badge
    const emblemY = bounds.cardY + 105;
    const emblemR = 40;

    ctx.save();
    ctx.shadowColor = d.color + '55';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(DESIGN_WIDTH / 2, emblemY, emblemR, 0, Math.PI * 2);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    this.drawEmblem(ctx, DESIGN_WIDTH / 2, emblemY, d.emblem, d.color);
    ctx.restore();

    // Difficulty Tier Label
    ctx.font = '900 24px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = d.color;
    ctx.textAlign = 'center';
    ctx.fillText(d.label, DESIGN_WIDTH / 2, bounds.cardY + 180);

    // Subtitle & description
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.fillText(d.subtitle + ' • ' + d.description, DESIGN_WIDTH / 2, bounds.cardY + 206);

    // Slider Track
    const usableW = bounds.trackW - 2 * bounds.knobR;
    const knobX = bounds.trackX + bounds.knobR + (sliderPos / 2) * usableW;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(
      bounds.trackX - 4,
      bounds.trackY - 4,
      bounds.trackW + 8,
      bounds.trackH + 8,
      (bounds.trackH + 8) / 2
    );
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();
    ctx.restore();

    ctx.save();
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
    ctx.restore();

    // Slider Knob
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
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
    ctx.font = '700 11px Fredoka, Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.fillText('EASY', bounds.trackX + bounds.knobR, bounds.trackY + 30);
    ctx.fillText('MEDIUM', bounds.trackX + bounds.trackW / 2, bounds.trackY + 30);
    ctx.fillText('HARD', bounds.trackX + bounds.trackW - bounds.knobR, bounds.trackY + 30);

    // [ PLAY ▶ ] Button
    ctx.save();
    ctx.shadowColor = d.color + '66';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.playX, bounds.playY, bounds.playW, bounds.playH, 18);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.restore();

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY ▶', bounds.playX + bounds.playW / 2, bounds.playY + bounds.playH / 2);

    // [ ? ] Tutorial Button
    ctx.save();
    ctx.shadowColor = 'rgba(139, 92, 246, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.qX, bounds.qY, bounds.qSize, bounds.qSize, 16);
    ctx.fillStyle = '#8B5CF6';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 24px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', bounds.qX + bounds.qSize / 2, bounds.qY + bounds.qSize / 2);
  }

  // Draw Difficulty Emblems (Leaf, Spark, Diamond)
  private drawEmblem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    type: 'leaf' | 'spark' | 'diamond',
    color: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (type === 'leaf') {
      // Leaf emblem for Easy
      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.bezierCurveTo(18, 12, 18, -12, 0, -18);
      ctx.bezierCurveTo(-18, -12, -18, 12, 0, 16);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, 16);
      ctx.lineTo(0, -14);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (type === 'spark') {
      // 4-Point Star Spark for Medium
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const radius = i % 2 === 0 ? 18 : 7;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // Diamond emblem for Hard
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(16, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(-16, 0);
      ctx.closePath();
      ctx.fill();

      // Inner gem facets
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 18);
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Tutorial / How to Play Modal
  public renderTutorialModal(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    const modalW = 328;
    const modalH = 460;
    const modalX = (DESIGN_WIDTH - modalW) / 2;
    const modalY = (DESIGN_HEIGHT - modalH) / 2;

    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    (ctx as any).roundRect(modalX, modalY, modalW, modalH, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 22px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', DESIGN_WIDTH / 2, modalY + 38);

    ctx.font = '700 13.5px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';

    const rules = [
      '1. Drag or tap above the column to drop your coral piece.',
      '2. Gravity pulls the piece to the lowest available cell.',
      '3. Connect 4 of your discs in a row to win:',
      '   • Horizontally ↔',
      '   • Vertically ↕',
      '   • Diagonally ↘ or ↗',
      '4. Block the smart bot before it connects four!'
    ];

    rules.forEach((line, i) => {
      ctx.fillText(line, modalX + 24, modalY + 80 + i * 28);
    });

    // Visual illustration of 4 connected
    const diagramY = modalY + 285;
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    (ctx as any).roundRect(modalX + 24, diagramY, modalW - 48, 70, 16);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const dx = modalX + 74 + i * 48;
      const dy = diagramY + 35;
      ctx.beginPath();
      ctx.arc(dx, dy, 16, 0, Math.PI * 2);
      ctx.fillStyle = THEME.playerDisc;
      ctx.fill();
      ctx.strokeStyle = THEME.holeOutline;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // White connection line through illustration
    ctx.beginPath();
    ctx.moveTo(modalX + 74, diagramY + 35);
    ctx.lineTo(modalX + 74 + 3 * 48, diagramY + 35);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // [ GOT IT! ▶ ] Button
    const btnW = 200;
    const btnH = 48;
    const btnX = (DESIGN_WIDTH - btnW) / 2;
    const btnY = modalY + modalH - 66;

    ctx.save();
    ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(btnX, btnY, btnW, btnH, 16);
    ctx.fillStyle = '#22C55E';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 17px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOT IT! ▶', btnX + btnW / 2, btnY + btnH / 2);
  }
}
