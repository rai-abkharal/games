export const ROWS = 6;
export const COLS = 7;
export const WIN_COUNT = 4;

export const DESIGN_WIDTH = 384;
export const DESIGN_HEIGHT = 850;

export enum Cell {
  Empty = 0,
  Player = 1, // Coral / Human
  Bot = 2     // Cyan / Bot
}

export enum GameState {
  DIFF_SELECT,
  PLAYER_TURN_INTRO,
  PLAYER_AIMING,
  PLAYER_DROPPING,
  BOT_THINKING,
  BOT_DROPPING,
  CHECKING_RESULT,
  WIN_LINE_ANIMATION,
  RESULT_TRANSITION,
  RESULT_SCREEN,
  TUTORIAL
}

export enum Difficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard'
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface FallingPiece {
  player: Cell;
  col: number;
  row: number;
  x: number;
  y: number;
  targetY: number;
  velocityY: number;
  bounceCount: number;
  settled: boolean;
}

export interface PreviewPiece {
  x: number;
  y: number;
  col: number;
  visible: boolean;
}

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  coins: number;
  color: string;
  emblem: 'leaf' | 'spark' | 'diamond';
  subtitle: string;
  description: string;
  depth: number;
  mistakeChance: number;
}

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: Difficulty.Easy,
    label: 'EASY',
    coins: 25,
    color: '#22C55E',
    emblem: 'leaf',
    subtitle: 'Relaxed & Fun',
    description: 'Casual AI • Makes frequent mistakes',
    depth: 2,
    mistakeChance: 0.35
  },
  {
    id: Difficulty.Medium,
    label: 'MEDIUM',
    coins: 50,
    color: '#F59E0B',
    emblem: 'spark',
    subtitle: 'Balanced Logic',
    description: 'Smart AI • 4-step forward strategy',
    depth: 4,
    mistakeChance: 0.10
  },
  {
    id: Difficulty.Hard,
    label: 'HARD',
    coins: 100,
    color: '#EF4444',
    emblem: 'diamond',
    subtitle: 'Deep Strategy',
    description: 'Master AI • Deep 6-step search & defense',
    depth: 6,
    mistakeChance: 0.0
  }
];

export interface HostBridge {
  post: (action: string, payload?: any) => void;
}
