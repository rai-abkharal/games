import { Difficulty } from '../game/Config';
// Sudoku Pro's existing ids, colors, slider order, and persisted selection contract.
export const DIFFICULTIES = [
  { id: 'easy', label: 'EASY', color: '#22C55E', emblem: 'leaf', subtitle: 'Gentle opponent · slower darts' },
  { id: 'medium', label: 'MEDIUM', color: '#F59E0B', emblem: 'spark', subtitle: 'Sharper opponent · quicker darts' },
  { id: 'hard', label: 'HARD', color: '#EF4444', emblem: 'diamond', subtitle: 'Skilled opponent · fastest darts' }
] as const;
export const DIFFICULTY_KEY = 'sudoku_pro_difficulty_v1';
export function normalizeDifficulty(value: unknown): Difficulty | null {
  if (value === 'expert') return 'hard';
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : null;
}
export function readDifficulty(storage: Pick<Storage, 'getItem'> | undefined): Difficulty {
  try {
    const selected = normalizeDifficulty(storage?.getItem(DIFFICULTY_KEY));
    if (selected) return selected;
    return normalizeDifficulty(JSON.parse(storage?.getItem('sudoku_pro_saved_game_v101') || '{}').difficulty) || 'easy';
  } catch { return 'easy'; }
}
export function saveDifficulty(difficulty: Difficulty) {
  try { localStorage.setItem(DIFFICULTY_KEY, difficulty); } catch { /* Storage is optional in embedded webviews. */ }
}
