export type Difficulty = 'easy' | 'medium' | 'hard';
export type Side = 'player' | 'bot';
export interface Point { x: number; y: number }
export const CONFIG = {
  startScore: 301,
  aim: { cycle: 2.1, extent: 1.12, inputGuard: 0.14 },
  difficulty: {
    easy: { flight: 0.72, error: 0.17, missChance: 0.075, tripleChance: 0.18, checkoutChance: 0.40 },
    medium: { flight: 0.49, error: 0.115, missChance: 0.045, tripleChance: 0.37, checkoutChance: 0.63 },
    hard: { flight: 0.30, error: 0.070, missChance: 0.025, tripleChance: 0.62, checkoutChance: 0.82 }
  },
  timing: { matchStart: 0.18, intro: 0.95, impact: 0.20, scoreReveal: 0.95, swap: 0.44 },
  camera: { zoom: 1.85, in: 0.20, hold: 0.58, out: 0.35 },
  maxEmbedded: 1,
  colors: { player: '#F35D52', bot: '#08AEE8', ink: '#242731', cream: '#FFF8E4' }
} as const;
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
// Every radius is relative to the outside of the double ring, for both art and scoring.
export const RINGS = { bullseye: 0.0525, bull: 0.12, tripleIn: 0.55, tripleOut: 0.615, doubleIn: 0.925, doubleOut: 1, numbers: 1.19 } as const;
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
