import { STARTING_LENGTH, STARTING_SCORE, Direction, GridCell, VisualPos } from './Types.js';
import { Grid } from './Grid.js';

export class Snake {
  public body: GridCell[] = [];
  public prevBody: GridCell[] = [];
  public currentDirection: Direction = Direction.UP;
  public directionQueue: Direction[] = [];
  public score: number = STARTING_SCORE;

  // Visual interpolation tracking
  public stepTimer: number = 0;
  public stepDuration: number = 0.25; // seconds per cell

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.score = STARTING_SCORE;
    this.currentDirection = Direction.UP;
    this.directionQueue = [];
    this.stepTimer = 0;

    // Center spawn: row 14, col 6 moving UP
    const startX = 6;
    const startY = 14;

    this.body = [];
    for (let i = 0; i < STARTING_LENGTH; i++) {
      this.body.push({ x: startX, y: startY + i });
    }

    this.prevBody = this.body.map(c => ({ ...c }));
  }

  public setSpeed(cellsPerSecond: number): void {
    this.stepDuration = 1.0 / Math.max(1, cellsPerSecond);
  }

  public requestDirection(newDir: Direction): void {
    // Check against the last planned direction (queue tail or currentDirection)
    const lastDir = this.directionQueue.length > 0 
      ? this.directionQueue[this.directionQueue.length - 1] 
      : this.currentDirection;

    // Ignore identical direction
    if (newDir === lastDir) return;

    // Ignore 180-degree instant reversal
    if (newDir === Grid.getOppositeDirection(lastDir)) return;

    // Buffer up to 2 directional inputs to ensure crisp response at high speeds
    if (this.directionQueue.length < 2) {
      this.directionQueue.push(newDir);
    }
  }

  public getHead(): GridCell {
    return this.body[0];
  }

  public getTail(): GridCell {
    return this.body[this.body.length - 1];
  }

  public getOccupiedCells(): GridCell[] {
    return this.body;
  }

  public isOccupying(cell: GridCell, excludeTail: boolean = false): boolean {
    const checkLength = excludeTail ? this.body.length - 1 : this.body.length;
    for (let i = 0; i < checkLength; i++) {
      if (Grid.areEqual(this.body[i], cell)) {
        return true;
      }
    }
    return false;
  }

  public getVisualSegments(progress: number): { x: number; y: number }[] {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const result: VisualPos[] = [];

    const len = this.body.length;
    for (let i = 0; i < len; i++) {
      const curr = this.body[i];
      // If this is a newly grown segment, prev was at the previous tail
      const prev = i < this.prevBody.length ? this.prevBody[i] : this.prevBody[this.prevBody.length - 1];

      result.push({
        x: prev.x + (curr.x - prev.x) * clampedProgress,
        y: prev.y + (curr.y - prev.y) * clampedProgress
      });
    }

    return result;
  }
}
