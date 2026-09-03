import { LevelDefinition } from './types';
import { LEVELS } from './levelsData';

export * from './types';
export * from './levelsData';

export function getLevel(id: number): LevelDefinition {
  const found = LEVELS.find(l => l.id === id);
  if (found) return found;
  // If beyond max level, loop or return last level
  const clampedId = Math.max(1, ((id - 1) % LEVELS.length) + 1);
  return LEVELS.find(l => l.id === clampedId) || LEVELS[0];
}

export const MAX_LEVELS = LEVELS.length;
