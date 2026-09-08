import { CONFIG, Difficulty, Point, SECTORS, clamp } from './Config';
import { sectorPoint } from './ScoreManager';
export class BotController {
  constructor(private random = Math.random) {}
  chooseTarget(remaining: number, difficulty: Difficulty): Point {
    const cfg = CONFIG.difficulty[difficulty];
    if (this.random() < cfg.missChance) {
      const a = this.random() * Math.PI * 2;
      return { x: Math.sin(a) * 1.09, y: Math.cos(a) * 1.09 };
    }
    let target: Point;
    let error = cfg.error;
    if (remaining <= 60 && this.random() < cfg.checkoutChance) {
      if (remaining === 50) target = { x: 0, y: 0 };
      else if (remaining === 25) target = { x: 0.075, y: 0 };
      else if (remaining <= 20) target = sectorPoint(remaining, 0.76);
      else if (remaining % 3 === 0 && remaining / 3 <= 20) target = sectorPoint(remaining / 3, 0.5825);
      else if (remaining % 2 === 0 && remaining / 2 <= 20) target = sectorPoint(remaining / 2, 0.9625);
      else target = sectorPoint(Math.min(20, remaining - 20), 0.76);
      error *= 0.42;
    } else if (this.random() < 0.12) {
      target = { x: 0, y: 0 };
      error *= 0.6;
    } else {
      const sector = this.random() < 0.68 ? 20 : SECTORS[Math.floor(this.random() * 20)];
      target = sectorPoint(sector, this.random() < cfg.tripleChance ? 0.5825 : 0.76);
    }
    const a = this.random() * Math.PI * 2;
    const r = Math.sqrt(this.random()) * error;
    return {
      x: clamp(target.x + Math.cos(a) * r, -1.1, 1.1),
      y: clamp(target.y + Math.sin(a) * r, -1.1, 1.1)
    };
  }
  // The bot visibly traverses the same linear meter and locks on its chosen pass.
  lockTime(value: number): number {
    const fraction = (value / CONFIG.aim.extent + 1) / 2;
    return CONFIG.aim.cycle * (1 - fraction / 2);
  }
}
