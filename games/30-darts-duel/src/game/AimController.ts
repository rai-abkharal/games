import { CONFIG, Point } from './Config';
export function pingPong(time: number, cycle = CONFIG.aim.cycle): number {
  const phase = ((time % cycle) + cycle) % cycle / cycle;
  return 1 - Math.abs(phase * 2 - 1);
}
export class AimController {
  x = 0;
  y = 0;
  time = 0;
  axis: 'x' | 'y' = 'x';
  reset() { this.x = -CONFIG.aim.extent; this.y = 0; this.time = 0; this.axis = 'x'; }
  update(dt: number) {
    this.time += dt;
    this[this.axis] = (pingPong(this.time) * 2 - 1) * CONFIG.aim.extent;
  }
  lockX() { this.axis = 'y'; this.time = 0; this.y = -CONFIG.aim.extent; }
  get point(): Point { return { x: this.x, y: this.y }; }
}
