import { ROWS, COLS, Cell, Difficulty } from './Types.js';
import { Rules } from './Rules.js';

export class AI {
  private static COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6];

  public static findBestMove(
    board: Cell[][],
    difficulty: Difficulty,
    botPlayer: Cell = Cell.Bot,
    humanPlayer: Cell = Cell.Player
  ): number {
    const validCols = Rules.getValidColumns(board);
    if (validCols.length === 0) return -1;
    if (validCols.length === 1) return validCols[0];

    // Difficulty settings
    let depth = 4;
    let mistakeChance = 0.10;

    if (difficulty === Difficulty.Easy) {
      depth = 2;
      mistakeChance = 0.35;
    } else if (difficulty === Difficulty.Hard) {
      depth = 6;
      mistakeChance = 0.0;
    }

    // Occasional mistake on lower difficulties to feel human/casual
    if (mistakeChance > 0 && Math.random() < mistakeChance) {
      // Pick a random valid column
      return validCols[Math.floor(Math.random() * validCols.length)];
    }

    // 1. Immediate Win: If bot can win right now, always take it
    for (const c of validCols) {
      const r = Rules.getAvailableRow(board, c);
      if (r >= 0) {
        board[r][c] = botPlayer;
        const win = Rules.getConnectedCells(board, r, c, botPlayer);
        board[r][c] = Cell.Empty;
        if (win) return c;
      }
    }

    // 2. Immediate Block: If human could win on next turn, block them (unless easy mistake)
    if (difficulty !== Difficulty.Easy || Math.random() > 0.15) {
      for (const c of validCols) {
        const r = Rules.getAvailableRow(board, c);
        if (r >= 0) {
          board[r][c] = humanPlayer;
          const win = Rules.getConnectedCells(board, r, c, humanPlayer);
          board[r][c] = Cell.Empty;
          if (win) return c;
        }
      }
    }

    // 3. Minimax with Alpha-Beta Pruning
    let bestScore = -Infinity;
    const scoredMoves: { col: number; score: number }[] = [];

    for (const col of this.COLUMN_ORDER) {
      if (!validCols.includes(col)) continue;

      const r = Rules.getAvailableRow(board, col);
      board[r][col] = botPlayer;
      const score = this.minimax(
        board,
        depth - 1,
        -Infinity,
        Infinity,
        false,
        botPlayer,
        humanPlayer
      );
      board[r][col] = Cell.Empty;

      scoredMoves.push({ col, score });
      if (score > bestScore) {
        bestScore = score;
      }
    }

    // Candidate randomization among near-optimal moves (+/- 5 points)
    // Prevents robotic identical opening sequences
    const candidates = scoredMoves.filter(m => m.score >= bestScore - 5);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return chosen ? chosen.col : validCols[0];
  }

  private static minimax(
    board: Cell[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    botPlayer: Cell,
    humanPlayer: Cell
  ): number {
    const validCols = Rules.getValidColumns(board);
    const isFull = validCols.length === 0;

    if (depth === 0 || isFull) {
      return this.evaluateBoard(board, botPlayer, humanPlayer);
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const col of this.COLUMN_ORDER) {
        if (!validCols.includes(col)) continue;
        const row = Rules.getAvailableRow(board, col);
        board[row][col] = botPlayer;

        // Fast terminal check
        if (Rules.getConnectedCells(board, row, col, botPlayer)) {
          board[row][col] = Cell.Empty;
          return 100000 + depth;
        }

        const score = this.minimax(board, depth - 1, alpha, beta, false, botPlayer, humanPlayer);
        board[row][col] = Cell.Empty;

        maxEval = Math.max(maxEval, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const col of this.COLUMN_ORDER) {
        if (!validCols.includes(col)) continue;
        const row = Rules.getAvailableRow(board, col);
        board[row][col] = humanPlayer;

        // Fast terminal check
        if (Rules.getConnectedCells(board, row, col, humanPlayer)) {
          board[row][col] = Cell.Empty;
          return -100000 - depth;
        }

        const score = this.minimax(board, depth - 1, alpha, beta, true, botPlayer, humanPlayer);
        board[row][col] = Cell.Empty;

        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private static evaluateBoard(board: Cell[][], botPlayer: Cell, humanPlayer: Cell): number {
    let score = 0;

    // Center Column Control Bonus (Center column 3 is strategically dominant)
    let centerCount = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][3] === botPlayer) centerCount++;
    }
    score += centerCount * 6;

    // 1. Horizontal Windows
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        const window = [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]];
        score += this.scoreWindow(window, botPlayer, humanPlayer);
      }
    }

    // 2. Vertical Windows
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 4; r++) {
        const window = [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]];
        score += this.scoreWindow(window, botPlayer, humanPlayer);
      }
    }

    // 3. Diagonal ↘ Windows
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        const window = [board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]];
        score += this.scoreWindow(window, botPlayer, humanPlayer);
      }
    }

    // 4. Diagonal ↗ Windows
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        const window = [board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]];
        score += this.scoreWindow(window, botPlayer, humanPlayer);
      }
    }

    return score;
  }

  private static scoreWindow(window: Cell[], botPlayer: Cell, humanPlayer: Cell): number {
    let bot = 0;
    let human = 0;
    let empty = 0;

    for (const cell of window) {
      if (cell === botPlayer) bot++;
      else if (cell === humanPlayer) human++;
      else empty++;
    }

    if (bot === 4) return 100000;
    if (bot === 3 && empty === 1) return 120;
    if (bot === 2 && empty === 2) return 15;

    if (human === 4) return -100000;
    if (human === 3 && empty === 1) return -170;
    if (human === 2 && empty === 2) return -15;

    return 0;
  }
}
