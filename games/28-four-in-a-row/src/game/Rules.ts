import { ROWS, COLS, Cell, CellPosition, WIN_COUNT } from './Types.js';

export class Rules {
  public static createEmptyBoard(): Cell[][] {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(Cell.Empty));
  }

  public static cloneBoard(board: Cell[][]): Cell[][] {
    return board.map(row => [...row]);
  }

  public static getAvailableRow(board: Cell[][], col: number): number {
    if (col < 0 || col >= COLS) return -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === Cell.Empty) {
        return r;
      }
    }
    return -1;
  }

  public static isColumnFull(board: Cell[][], col: number): boolean {
    return board[0][col] !== Cell.Empty;
  }

  public static getValidColumns(board: Cell[][]): number[] {
    const valid: number[] = [];
    for (let c = 0; c < COLS; c++) {
      if (board[0][c] === Cell.Empty) {
        valid.push(c);
      }
    }
    return valid;
  }

  public static isBoardFull(board: Cell[][]): boolean {
    for (let c = 0; c < COLS; c++) {
      if (board[0][c] === Cell.Empty) return false;
    }
    return true;
  }

  // Returns array of 4 winning cell coordinates if a connection exists through (row, col)
  public static getConnectedCells(
    board: Cell[][],
    row: number,
    col: number,
    player: Cell
  ): CellPosition[] | null {
    if (player === Cell.Empty) return null;

    const directions = [
      [0, 1],   // Horizontal
      [1, 0],   // Vertical
      [1, 1],   // Diagonal ↘
      [-1, 1]   // Diagonal ↗
    ];

    for (const [dr, dc] of directions) {
      const line: CellPosition[] = [{ row, col }];

      // Forward direction
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.push({ row: r, col: c });
        r += dr;
        c += dc;
      }

      // Backward direction
      r = row - dr;
      c = col - dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.unshift({ row: r, col: c });
        r -= dr;
        c -= dc;
      }

      if (line.length >= WIN_COUNT) {
        // Return exactly 4 connected cells from the winning segment
        return line.slice(0, 4);
      }
    }

    return null;
  }

  // Checks entire board for any winner
  public static checkWinner(board: Cell[][]): { winner: Cell; cells: CellPosition[] } | null {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell !== Cell.Empty) {
          const connected = this.getConnectedCells(board, r, c, cell);
          if (connected) {
            return { winner: cell, cells: connected };
          }
        }
      }
    }
    return null;
  }
}
