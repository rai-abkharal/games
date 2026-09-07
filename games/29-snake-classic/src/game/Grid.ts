import { GRID_COLS, GRID_ROWS, Direction, GridCell } from './Types.js';

export class Grid {
  public static readonly COLS = GRID_COLS;
  public static readonly ROWS = GRID_ROWS;

  public static isInside(cell: GridCell): boolean {
    return cell.x >= 0 && cell.x < GRID_COLS && cell.y >= 0 && cell.y < GRID_ROWS;
  }

  public static areEqual(a: GridCell, b: GridCell): boolean {
    return a.x === b.x && a.y === b.y;
  }

  public static getOppositeDirection(dir: Direction): Direction {
    switch (dir) {
      case Direction.UP:
        return Direction.DOWN;
      case Direction.DOWN:
        return Direction.UP;
      case Direction.LEFT:
        return Direction.RIGHT;
      case Direction.RIGHT:
        return Direction.LEFT;
    }
  }

  public static getDirectionVector(dir: Direction): GridCell {
    switch (dir) {
      case Direction.UP:
        return { x: 0, y: -1 };
      case Direction.DOWN:
        return { x: 0, y: 1 };
      case Direction.LEFT:
        return { x: -1, y: 0 };
      case Direction.RIGHT:
        return { x: 1, y: 0 };
    }
  }

  public static getRandomFreeCell(occupied: GridCell[]): GridCell | null {
    const occupiedSet = new Set<string>();
    for (const c of occupied) {
      occupiedSet.add(`${c.x},${c.y}`);
    }

    const freeCells: GridCell[] = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        if (!occupiedSet.has(`${x},${y}`)) {
          freeCells.push({ x, y });
        }
      }
    }

    if (freeCells.length === 0) return null;
    const idx = Math.floor(Math.random() * freeCells.length);
    return freeCells[idx];
  }
}
