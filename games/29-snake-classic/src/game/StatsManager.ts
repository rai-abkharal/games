import { Difficulty, ModeStats } from './Types.js';

export class StatsManager {
  private static readonly STORAGE_KEY = 'cute_snake_mode_stats_v1';
  private stats: Record<Difficulty, ModeStats>;

  constructor() {
    this.stats = this.loadStats();
    this.validateTimeBoundaries();
  }

  private getDateKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private getWeekKey(): string {
    const d = new Date();
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const pastDaysOfYear = (d.getTime() - startOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${weekNum}`;
  }

  private getDefaultStats(): Record<Difficulty, ModeStats> {
    const dateKey = this.getDateKey();
    const weekKey = this.getWeekKey();
    return {
      [Difficulty.Easy]: {
        todayBest: 4,
        weekBest: 4,
        allTimeBest: 4,
        lastDateKey: dateKey,
        lastWeekKey: weekKey
      },
      [Difficulty.Medium]: {
        todayBest: 4,
        weekBest: 4,
        allTimeBest: 4,
        lastDateKey: dateKey,
        lastWeekKey: weekKey
      },
      [Difficulty.Hard]: {
        todayBest: 4,
        weekBest: 4,
        allTimeBest: 4,
        lastDateKey: dateKey,
        lastWeekKey: weekKey
      }
    };
  }

  private loadStats(): Record<Difficulty, ModeStats> {
    const defaults = this.getDefaultStats();
    try {
      const raw = localStorage.getItem(StatsManager.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          [Difficulty.Easy]: { ...defaults[Difficulty.Easy], ...(parsed[Difficulty.Easy] || {}) },
          [Difficulty.Medium]: { ...defaults[Difficulty.Medium], ...(parsed[Difficulty.Medium] || {}) },
          [Difficulty.Hard]: { ...defaults[Difficulty.Hard], ...(parsed[Difficulty.Hard] || {}) }
        };
      }
    } catch {}
    return defaults;
  }

  private saveStats(): void {
    try {
      localStorage.setItem(StatsManager.STORAGE_KEY, JSON.stringify(this.stats));
    } catch {}
  }

  public validateTimeBoundaries(): void {
    const curDate = this.getDateKey();
    const curWeek = this.getWeekKey();
    let changed = false;

    for (const diff of [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard]) {
      const s = this.stats[diff];
      if (s.lastDateKey !== curDate) {
        s.todayBest = 4;
        s.lastDateKey = curDate;
        changed = true;
      }
      if (s.lastWeekKey !== curWeek) {
        s.weekBest = 4;
        s.lastWeekKey = curWeek;
        changed = true;
      }
    }

    if (changed) {
      this.saveStats();
    }
  }

  public getStats(diff: Difficulty): ModeStats {
    this.validateTimeBoundaries();
    return this.stats[diff];
  }

  public getLiveAllTime(diff: Difficulty, currentScore: number): number {
    const s = this.getStats(diff);
    return Math.max(s.allTimeBest, currentScore);
  }

  public recordScore(diff: Difficulty, score: number): void {
    this.validateTimeBoundaries();
    const s = this.stats[diff];
    s.todayBest = Math.max(s.todayBest, score);
    s.weekBest = Math.max(s.weekBest, score);
    s.allTimeBest = Math.max(s.allTimeBest, score);
    this.saveStats();
  }
}
