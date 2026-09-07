import {
  ROWS,
  COLS,
  Cell,
  GameState,
  Difficulty,
  DIFFICULTIES,
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

  public width: number = 400;
  public height: number = 800;
  public dpr: number = 1;

  // Cached pre-rendered board front plate canvas
  private plateCanvas: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Failed to obtain 2D canvas context');
    this.ctx = context;
  }

  // Multi-DPI Canvas Resizing with Dynamic Responsive Board Expansion
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

    // DYNAMIC RESPONSIVE BOARD EXPANSION:
    // On mobile screens, board expands edge-to-edge (only 5-7px side margins matching user reference)
    const sideMargin = Math.max(4, Math.min(8, Math.round(w * 0.016)));
    const maxBoardH = h - 160; // Leave room for top header and bottom HUD
    const maxBoardWByHeight = maxBoardH / 0.98;

    const boardW = Math.min(w - 2 * sideMargin, Math.min(500, maxBoardWByHeight));
    const boardX = Math.round((w - boardW) / 2);

    const colSpacing = boardW / 7;
    const slotRadius = colSpacing * 0.428;
    const slotOutlineWidth = Math.max(3.5, colSpacing * 0.095);
    const baseBarH = Math.round(colSpacing * 0.65);
    const boardH = Math.round(6 * colSpacing + baseBarH + colSpacing * 0.06);
    const boardRadius = Math.round(colSpacing * 0.38);

    // Vertical positioning: balanced between header and bottom HUD
    const topSafe = 85;
    const bottomSafe = 100;
    const freeV = Math.max(0, h - topSafe - bottomSafe - boardH);
    const boardY = Math.round(topSafe + freeV * 0.42);
    const previewY = Math.round(boardY - slotRadius - 12);

    THEME.boardX = boardX;
    THEME.boardY = boardY;
    THEME.boardW = boardW;
    THEME.boardH = boardH;
    THEME.boardRadius = boardRadius;
    THEME.slotRadius = slotRadius;
    THEME.slotOutlineWidth = slotOutlineWidth;
    THEME.previewY = previewY;

    for (let c = 0; c < 7; c++) {
      THEME.slotCentersX[c] = boardX + (c + 0.5) * colSpacing;
    }
    const gridTop = boardY + colSpacing * 0.53;
    for (let r = 0; r < 6; r++) {
      THEME.slotCentersY[r] = gridTop + r * colSpacing;
    }

    this.plateCanvas = null;
  }

  // Direct 1:1 CSS pixel touch coordinates (Zero scaling offset/distortion)
  public toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // Generate physically punched front plate with 42 transparent holes using destination-out
  private getFrontPlate(): HTMLCanvasElement {
    if (this.plateCanvas) return this.plateCanvas;

    const w = THEME.boardW;
    const h = THEME.boardH;

    const plate = document.createElement('canvas');
    plate.width = Math.round(w * 2);
    plate.height = Math.round(h * 2);
    const pctx = plate.getContext('2d')!;
    pctx.scale(2, 2);

    // 1. Fill entire board plate in deep slate (#1F2630) with rounded top corners
    pctx.beginPath();
    (pctx as any).roundRect(0, 0, w, h, [THEME.boardRadius, THEME.boardRadius, 4, 4]);
    pctx.fillStyle = THEME.boardFace;
    pctx.fill();

    // 2. Punch out the 42 circular holes cleanly using destination-out
    pctx.globalCompositeOperation = 'destination-out';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = THEME.slotCentersX[c] - THEME.boardX;
        const cy = THEME.slotCentersY[r] - THEME.boardY;
        pctx.beginPath();
        pctx.arc(cx, cy, THEME.slotRadius, 0, Math.PI * 2);
        pctx.fill();
      }
    }
    pctx.globalCompositeOperation = 'source-over';

    // 3. Bottom Base Bar (Dark Charcoal #151C23)
    const baseBarH = Math.round((THEME.boardW / 7) * 0.65);
    const baseBarY = h - baseBarH;
    pctx.beginPath();
    (pctx as any).roundRect(0, baseBarY, w, baseBarH, [0, 0, 4, 4]);
    pctx.fillStyle = THEME.baseBar;
    pctx.fill();

    // Subtle horizontal divider line above base bar
    pctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(0, baseBarY);
    pctx.lineTo(w, baseBarY);
    pctx.stroke();

    this.plateCanvas = plate;
    return plate;
  }

  // Main Render Routine
  public render(
    state: GameState,
    board: Cell[][],
    difficulty: Difficulty,
    sliderPos: number,
    turnProgress: number,
    yourTurnProgress: number,
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
    const screenW = this.width;
    const screenH = this.height;

    // 1. FULL-BLEED BACKGROUND: Fill the ENTIRE viewport screen edge-to-edge
    this.renderFullBleedBackground(ctx, turnProgress, screenW, screenH);

    // 2. HUD: "Your turn" bottom circle or "Bot thinking" panel
    this.renderHUD(ctx, state, yourTurnProgress, botThinkingTime);

    // 3. Behind Board: Empty Hole Slate Backgrounds
    this.renderHoleBackgrounds(ctx);

    // 4. Behind Board: Settled Pieces
    this.renderSettledPieces(ctx, board);

    // 5. Behind Board: Currently Falling Piece (Masked behind front plate!)
    if (fallingPiece) {
      this.renderDisc(ctx, fallingPiece.x, fallingPiece.y, fallingPiece.player);
    }

    // 6. Board Front Face Plate (Punched with 42 transparent apertures)
    const plate = this.getFrontPlate();
    ctx.drawImage(plate, THEME.boardX, THEME.boardY, THEME.boardW, THEME.boardH);

    // 7. On Top of Board: Thick Black Outlines around each of the 42 cells
    this.renderHoleOutlines(ctx);

    // 8. On Top of Board: Preview Aiming Piece (resting right on top rim of board)
    if (previewPiece.visible && (state === GameState.PLAYER_AIMING || state === GameState.PLAYER_TURN_INTRO)) {
      this.renderDisc(ctx, previewPiece.x, previewPiece.y, Cell.Player, true);
    }

    // 9. Winning Animated White Line
    if (winningCells && winningCells.length >= 4 && winLineProgress > 0) {
      this.renderWinningLine(ctx, winningCells, winLineProgress);
    }

    // 10. Top Navigation Header (Sudoku Pro Difficulty Banner and Restart - Audio button removed)
    this.renderHeader(ctx, difficulty);

    // 11. Result Overlay Screen (Settings & Play Again buttons only - No Home button)
    if (resultOverlayOpacity > 0) {
      this.renderResultScreen(ctx, winner, resultOverlayOpacity);
    }

    // 12. Sudoku Pro Style "SELECT DIFFICULTY" Modal (Clean, No subtitle lines, Neutral dimming)
    if (state === GameState.DIFF_SELECT) {
      this.renderDifficultyDialog(ctx, sliderPos);
    } else if (state === GameState.TUTORIAL) {
      this.renderTutorialModal(ctx);
    }
  }

  // Full-bleed background extending edge-to-edge across entire screen (Zero borders)
  private renderFullBleedBackground(
    ctx: CanvasRenderingContext2D,
    turnProgress: number,
    w: number,
    h: number
  ): void {
    const r = Math.round(249 + (90 - 249) * turnProgress);
    const g = Math.round(153 + (167 - 153) * turnProgress);
    const b = Math.round(117 + (212 - 117) * turnProgress);
    const bgColor = `rgb(${r}, ${g}, ${b})`;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Subtle ambient lighting gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // "Your turn" bottom circle & "Bot thinking" rounded panel
  private renderHUD(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    yourTurnProgress: number,
    botThinkingTime: number
  ): void {
    const w = this.width;
    const h = this.height;

    // 1. "Your turn" bottom circle animation
    if (yourTurnProgress > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, yourTurnProgress);

      const circleY = h - 16 - yourTurnProgress * 12;
      const circleR = Math.min(88, Math.round(w * 0.22));

      ctx.beginPath();
      ctx.arc(w / 2, circleY, circleR, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.font = '800 22px Fredoka, Nunito, Inter, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Your turn', w / 2, circleY - 30);
      ctx.restore();
    }

    // 2. "Bot thinking" rounded panel from reference video
    if (state === GameState.BOT_THINKING || state === GameState.BOT_DROPPING) {
      ctx.save();
      const panelW = Math.min(270, w - 40);
      const panelH = 62;
      const panelX = (w - panelW) / 2;
      const panelY = Math.max(76, THEME.previewY - panelH - 12);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      ctx.beginPath();
      (ctx as any).roundRect(panelX, panelY, panelW, panelH, 18);
      ctx.fillStyle = 'rgba(28, 48, 70, 0.88)';
      ctx.fill();
      ctx.restore();

      const dotCount = Math.floor((botThinkingTime * 4) % 4);
      const dots = '.'.repeat(dotCount);

      ctx.save();
      ctx.font = '800 22px Fredoka, Nunito, Inter, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Bot thinking${dots}`, w / 2, panelY + panelH / 2);
      ctx.restore();
    }
  }

  // 42 Empty Hole Backings (Clean slate gray #545B64)
  private renderHoleBackgrounds(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = THEME.emptyHole;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.arc(THEME.slotCentersX[c], THEME.slotCentersY[r], THEME.slotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Stationary pieces committed to board (Flat solid colors)
  private renderSettledPieces(ctx: CanvasRenderingContext2D, board: Cell[][]): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell !== Cell.Empty) {
          this.renderDisc(ctx, THEME.slotCentersX[c], THEME.slotCentersY[r], cell);
        }
      }
    }
  }

  // Solid flat disc rendering with optional black outline (used for preview piece)
  public renderDisc(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: Cell,
    hasBlackOutline: boolean = false
  ): void {
    ctx.save();
    const color = player === Cell.Player ? THEME.playerDisc : THEME.botDisc;
    const r = THEME.slotRadius;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (hasBlackOutline) {
      ctx.strokeStyle = THEME.holeOutline;
      ctx.lineWidth = THEME.slotOutlineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Heavy Pure Black Outlines around each of the 42 cells
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
    ctx.lineWidth = Math.max(8, THEME.slotRadius * 0.42);
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

  // Top Header: Sudoku Pro Difficulty Pill Banner and Restart (Audio button removed per user request)
  private renderHeader(
    ctx: CanvasRenderingContext2D,
    difficulty: Difficulty
  ): void {
    const diffObj = DIFFICULTIES.find(d => d.id === difficulty) || DIFFICULTIES[0];
    const w = this.width;

    // 1. Sudoku Pro Difficulty Pill Banner (Centered)
    const pillW = 140;
    const pillH = 38;
    const pillX = Math.round((w - pillW) / 2);
    const pillY = 32;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    (ctx as any).roundRect(pillX, pillY, pillW, pillH, 19);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Colored difficulty indicator dot
    ctx.beginPath();
    ctx.arc(pillX + 22, pillY + pillH / 2, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = diffObj.color;
    ctx.fill();

    ctx.font = '800 13px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#1E293B';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${diffObj.label} ▼`, pillX + 36, pillY + pillH / 2);
    ctx.restore();

    // 2. Restart Button (Top Right matching user phone reference screenshot)
    const restartR = 21;
    const restartX = w - 40;
    const restartY = 51;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(restartX, restartY, restartR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.font = '800 22px sans-serif';
    ctx.fillStyle = '#E87063';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↺', restartX, restartY - 1);
  }

  // Result Button Dynamic Bounds (Settings + PLAY AGAIN only - No Home button)
  public getResultButtonBounds() {
    const w = this.width;
    const h = this.height;
    const btnH = 54;
    const btnY = Math.min(h - 90, THEME.boardY + THEME.boardH + 28);
    const settingsW = 54;
    const gap = 12;
    const playAgainW = Math.min(220, w - settingsW - gap - 48);
    const totalW = settingsW + gap + playAgainW;
    const settingsX = (w - totalW) / 2;
    const playAgainX = settingsX + settingsW + gap;
    return { settingsX, settingsW, playAgainX, playAgainW, btnY, btnH };
  }

  // Result Overlay Screen (Settings & Play Again buttons only - Home removed)
  private renderResultScreen(
    ctx: CanvasRenderingContext2D,
    winner: Cell | null,
    opacity: number
  ): void {
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = THEME.resultOverlay;
    ctx.fillRect(0, 0, w, h);

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

    const titleY = Math.max(140, THEME.boardY - 60);

    ctx.font = '900 48px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = titleColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 16;
    ctx.fillText(title, w / 2, titleY);

    ctx.font = '700 16px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fillText(sub, w / 2, titleY + 40);

    const bounds = this.getResultButtonBounds();

    // 1. Difficulty / Settings Button (Purple Square)
    ctx.save();
    ctx.shadowColor = 'rgba(139, 92, 246, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.settingsX, bounds.btnY, bounds.settingsW, bounds.btnH, 18);
    ctx.fillStyle = THEME.btnStats;
    ctx.fill();
    ctx.restore();

    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚙', bounds.settingsX + bounds.settingsW / 2, bounds.btnY + bounds.btnH / 2);

    // 2. PLAY AGAIN Button (Green Rectangle)
    ctx.save();
    ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    (ctx as any).roundRect(bounds.playAgainX, bounds.btnY, bounds.playAgainW, bounds.btnH, 18);
    ctx.fillStyle = THEME.btnPlayAgain;
    ctx.fill();
    ctx.restore();

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY AGAIN ▶', bounds.playAgainX + bounds.playAgainW / 2, bounds.btnY + bounds.btnH / 2);

    ctx.restore();
  }

  // Exact Sudoku Pro Style "SELECT DIFFICULTY" Modal Bounds
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

  // Sudoku Pro Style Difficulty Dialog (Clean, No subtitle lines, Neutral dimming)
  public renderDifficultyDialog(ctx: CanvasRenderingContext2D, sliderPos: number): void {
    const w = this.width;
    const h = this.height;

    // Clean neutral dimming overlay across the entire screen (No murky blue/color tint)
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
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

    // Close button (X) top right of card
    ctx.save();
    ctx.font = '700 18px Fredoka, Inter, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', bounds.cardX + bounds.cardW - 24, bounds.cardY + 26);
    ctx.restore();

    // Dialog Header Title
    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', bounds.cardX + bounds.cardW / 2, bounds.cardY + 36);

    // Center Vector Emblem Badge
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

    this.drawEmblem(ctx, bounds.cardX + bounds.cardW / 2, emblemY, d.emblem, d.color);
    ctx.restore();

    // Difficulty Tier Label (EASY / MEDIUM / HARD)
    ctx.font = '900 24px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = d.color;
    ctx.textAlign = 'center';
    ctx.fillText(d.label, bounds.cardX + bounds.cardW / 2, bounds.cardY + 165);

    // NOTE: Subtitle lines ("Relaxed & Fun", "Deep Strategy", etc.) are completely omitted per user instruction!

    // Slider Track
    const usableW = bounds.trackW - 2 * bounds.knobR;
    const knobX = bounds.trackX + bounds.knobR + (sliderPos / 2) * usableW;

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

    // Slider Knob with subtle neutral shadow
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
    ctx.restore();

    ctx.font = '900 18px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY ▶', bounds.playX + bounds.playW / 2, bounds.playY + bounds.playH / 2);
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
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(16, 0);
      ctx.lineTo(0, 18);
      ctx.lineTo(-16, 0);
      ctx.closePath();
      ctx.fill();

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
    const w = this.width;
    const h = this.height;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const modalW = Math.min(336, w - 32);
    const modalH = 460;
    const modalX = (w - modalW) / 2;
    const modalY = Math.max(20, (h - modalH) / 2);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    (ctx as any).roundRect(modalX, modalY, modalW, modalH, 24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.font = '900 22px Fredoka, Nunito, Inter, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', w / 2, modalY + 38);

    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';

    const rules = [
      '1. Tap or slide to drop your coral piece.',
      '2. Gravity pulls the piece down into the cell.',
      '3. Connect 4 discs in a row to win:',
      '   • Horizontally ↔',
      '   • Vertically ↕',
      '   • Diagonally ↘ or ↗',
      '4. Block the smart bot before it wins!'
    ];

    rules.forEach((line, i) => {
      ctx.fillText(line, modalX + 22, modalY + 80 + i * 28);
    });

    // Visual illustration of 4 connected
    const diagramY = modalY + 285;
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    (ctx as any).roundRect(modalX + 20, diagramY, modalW - 40, 70, 16);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const dx = modalX + 58 + i * 46;
      const dy = diagramY + 35;
      ctx.beginPath();
      ctx.arc(dx, dy, 15, 0, Math.PI * 2);
      ctx.fillStyle = THEME.playerDisc;
      ctx.fill();
      ctx.strokeStyle = THEME.holeOutline;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // White connection line through illustration
    ctx.beginPath();
    ctx.moveTo(modalX + 58, diagramY + 35);
    ctx.lineTo(modalX + 58 + 3 * 46, diagramY + 35);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // [ GOT IT! ▶ ] Button
    const btnW = Math.min(200, modalW - 48);
    const btnH = 48;
    const btnX = (w - btnW) / 2;
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
