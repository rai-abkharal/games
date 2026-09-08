import { Difficulty } from '../game/Config';
// Sudoku Pro is a visual reference only; these settings belong to Darts Duel.
export const DIFFICULTIES = [
  { id: 'easy', label: 'EASY', color: '#22C55E', emblem: 'leaf', subtitle: 'Gentle opponent · slower darts' },
  { id: 'medium', label: 'MEDIUM', color: '#F59E0B', emblem: 'spark', subtitle: 'Sharper opponent · quicker darts' },
  { id: 'hard', label: 'HARD', color: '#EF4444', emblem: 'diamond', subtitle: 'Skilled opponent · fastest darts' }
] as const;
export const DIFFICULTY_KEY = 'darts_duel_difficulty_v1';
export function normalizeDifficulty(value: unknown): Difficulty | null {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : null;
}
export function readDifficulty(storage: Pick<Storage, 'getItem'> | undefined): Difficulty {
  try {
    return normalizeDifficulty(storage?.getItem(DIFFICULTY_KEY)) || 'easy';
  } catch { return 'easy'; }
}
export function saveDifficulty(difficulty: Difficulty) {
  try { localStorage.setItem(DIFFICULTY_KEY, difficulty); } catch { /* Storage is optional in embedded webviews. */ }
}
