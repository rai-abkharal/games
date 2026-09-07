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
    // Easy: Friendly & casual, misses 80% of blocks and 65% of wins so players win easily
    // Medium: Balanced & beatable, misses 50% of blocks and allows player setups and forks to win
    // Hard: Capable opponent, but toned down to depth 3 and misses 30% of blocks so players can win
    let depth = 2;
    let mistakeChance = 0.30;
    let winChance = 0.65;
    let blockChance = 0.50;
    let candidateTolerance = 30;
    let centerWeight = 2;

    if (difficulty === Difficulty.Easy) {
      depth = 1;
      mistakeChance = 0.50;
      winChance = 0.35;
      blockChance = 0.20;
      candidateTolerance = 50;
      centerWeight = 1;
    } else if (difficulty === Difficulty.Hard) {
      depth = 3;
      mistakeChance = 0.18;
      winChance = 0.80;
      blockChance = 0.70;
      candidateTolerance = 18;
      centerWeight = 3;
    }

    // Occasional casual/mistake move so the game feels human and enjoyable
    if (mistakeChance > 0 && Math.random() < mistakeChance) {
      return validCols[Math.floor(Math.random() * validCols.length)];
    }

    // Check immediate winning columns for bot
    const botWinningCols: number[] = [];
    for (const c of validCols) {
      const r = Rules.getAvailableRow(board, c);
      if (r >= 0) {
        board[r][c] = botPlayer;
        if (Rules.getConnectedCells(board, r, c, botPlayer)) {
          botWinningCols.push(c);
        }
        board[r][c] = Cell.Empty;
      }
    }

    // 1. Bot immediate win handling
    if (botWinningCols.length > 0) {
      if (Math.random() < winChance) {
        return botWinningCols[Math.floor(Math.random() * botWinningCols.length)];
      }
      // Overlooked win: filter out the winning column so it plays elsewhere
      const otherCols = validCols.filter(c => !botWinningCols.includes(c));
      if (otherCols.length > 0) {
        return otherCols[Math.floor(Math.random() * otherCols.length)];
      }
      return botWinningCols[0];
    }

    // Check immediate winning columns for human
    const humanWinningCols: number[] = [];
    for (const c of validCols) {
      const r = Rules.getAvailableRow(board, c);
      if (r >= 0) {
        board[r][c] = humanPlayer;
        if (Rules.getConnectedCells(board, r, c, humanPlayer)) {
          humanWinningCols.push(c);
        }
        board[r][c] = Cell.Empty;
      }
    }

    // 2. Human immediate win handling (blocking)
    if (humanWinningCols.length > 0) {
      if (Math.random() < blockChance) {
        return humanWinningCols[Math.floor(Math.random() * humanWinningCols.length)];
      }
      // Deliberately missed block: choose from other columns to allow player to win!
      const otherCols = validCols.filter(c => !humanWinningCols.includes(c));
      if (otherCols.length > 0) {
        return otherCols[Math.floor(Math.random() * otherCols.length)];
      }
      return humanWinningCols[0];
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
        humanPlayer,
        centerWeight
      );
      board[r][col] = Cell.Empty;

      scoredMoves.push({ col, score });
      if (score > bestScore) {
        bestScore = score;
      }
    }

    // Candidate randomization among near-optimal moves
    // Prevents robotic identical opening sequences and gives human-like play
    const candidates = scoredMoves.filter(m => m.score >= bestScore - candidateTolerance);
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
    humanPlayer: Cell,
    centerWeight: number = 2
  ): number {
    const validCols = Rules.getValidColumns(board);
    const isFull = validCols.length === 0;

    if (depth === 0 || isFull) {
      return this.evaluateBoard(board, botPlayer, humanPlayer, centerWeight);
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

        const score = this.minimax(board, depth - 1, alpha, beta, false, botPlayer, humanPlayer, centerWeight);
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

        const score = this.minimax(board, depth - 1, alpha, beta, true, botPlayer, humanPlayer, centerWeight);
        board[row][col] = Cell.Empty;

        minEval = Math.min(minEval, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private static evaluateBoard(
    board: Cell[][],
    botPlayer: Cell,
    humanPlayer: Cell,
    centerWeight: number = 2
  ): number {
    let score = 0;

    // Center Column Control Bonus (Scaled by difficulty)
    let centerCount = 0;
    for (let r = 0; r < ROWS; r++) {
      if (board[r][3] === botPlayer) centerCount++;
    }
    score += centerCount * centerWeight;

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
    if (bot === 3 && empty === 1) return 80;
    if (bot === 2 && empty === 2) return 10;

    if (human === 4) return -100000;
    if (human === 3 && empty === 1) return -90;
    if (human === 2 && empty === 2) return -10;

    return 0;
  }
}
