import { GridCell, FoodItem } from './Types.js';
import { Grid } from './Grid.js';

export class FoodManager {
  public items: FoodItem[] = [];
  private nextId: number = 1;

  public init(targetCount: number, snakeCells: GridCell[]): void {
    this.items = [];
    for (let i = 0; i < targetCount; i++) {
      this.spawnOne(snakeCells);
    }
  }

  public getFoodCells(): GridCell[] {
    return this.items.map(f => ({ x: f.x, y: f.y }));
  }

  public checkEaten(head: GridCell): FoodItem | null {
    const idx = this.items.findIndex(f => f.x === head.x && f.y === head.y);
    if (idx !== -1) {
      return this.items[idx];
    }
    return null;
  }

  public removeAndRespawn(eaten: FoodItem, snakeCells: GridCell[]): void {
    this.items = this.items.filter(f => f.id !== eaten.id);
    this.spawnOne(snakeCells);
  }

  public spawnOne(snakeCells: GridCell[]): boolean {
    const occupied = [...snakeCells, ...this.getFoodCells()];
    const free = Grid.getRandomFreeCell(occupied);
    if (!free) return false;

    this.items.push({
      id: this.nextId++,
      x: free.x,
      y: free.y,
      rotation: Math.random() * Math.PI * 2,
      spawnTime: performance.now()
    });
    return true;
  }
}
