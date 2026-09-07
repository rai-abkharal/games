export const GRID_COLS = 13;
export const GRID_ROWS = 21;
export const STARTING_SCORE = 4;
export const STARTING_LENGTH = 4;

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT'
}

export enum Difficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard'
}

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  badgeLabel: string;
  cellsPerSecond: number;
  activeFoods: number;
  color: string;
  emblem: 'sprout' | 'sunglasses' | 'devil';
}

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: Difficulty.Easy,
    label: 'EASY',
    badgeLabel: 'EASY MODE',
    cellsPerSecond: 4,
    activeFoods: 3,
    color: '#22C55E',
    emblem: 'sprout'
  },
  {
    id: Difficulty.Medium,
    label: 'MEDIUM',
    badgeLabel: 'MEDIUM MODE',
    cellsPerSecond: 6,
    activeFoods: 2,
    color: '#F59E0B',
    emblem: 'sunglasses'
  },
  {
    id: Difficulty.Hard,
    label: 'HARD',
    badgeLabel: 'HARD MODE',
    cellsPerSecond: 8,
    activeFoods: 2,
    color: '#EF4444',
    emblem: 'devil'
  }
];

export enum GameState {
  DIFF_SELECT = 'DIFF_SELECT',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  COLLISION_FREEZE = 'COLLISION_FREEZE',
  RESULT_TRANSITION = 'RESULT_TRANSITION',
  GAME_OVER = 'GAME_OVER',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE'
}

export interface GridCell {
  x: number;
  y: number;
}

export interface VisualPos {
  x: number;
  y: number;
}

export interface FoodItem {
  id: number;
  x: number;
  y: number;
  spawnTime: number;
}

export interface ModeStats {
  todayBest: number;
  weekBest: number;
  allTimeBest: number;
  lastDateKey: string;
  lastWeekKey: string;
}

export interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  spin: number;
  color: string;
}

export interface HostBridge {
  post(action: string, payload?: any): void;
}
