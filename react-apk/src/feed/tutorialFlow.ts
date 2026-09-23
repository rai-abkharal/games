import type { GameItem } from '../types/game';
import type { ReadyBundle } from '../services/gameBundles';
import type { PageSlot } from './preloadPlanner';

/** Later tutorial games boot on selection, never from a parked offscreen canvas. */
export function tutorialStartsOnSelection(game: GameItem): boolean {
  const step = tutorialGameStep(game);
  return Boolean(game.tutorial && (step === 'knife_hit_playing' || step === 'water_sort_playing'));
}

export function canPreloadTutorial(game: GameItem): boolean {
  return Boolean(game.tutorial && !tutorialStartsOnSelection(game));
}

export function tutorialPageLoadPolicy(
  game: GameItem, slot: PageSlot, hostSuspended: boolean, settling: boolean, currentReady: boolean,
) {
  const startNow = slot === 'active' && tutorialStartsOnSelection(game);
  const preloadTutorial = slot === 'ahead' && canPreloadTutorial(game) && currentReady;
  return {
    preloadTutorial,
    mayLoad: !hostSuspended && (!settling || startNow) && (slot === 'active' || preloadTutorial),
    // A selected tutorial game starts even while the pager finishes its slide.
    // Real suspension (background, navigation, ad) still always wins.
    suspended: hostSuspended || (settling && !startNow),
  };
}

export function bundledTutorialGames(bundles: ReadyBundle[]): GameItem[] {
  const titles: Record<string, string> = {
    'arrow-puzzle': 'Arrow Puzzle', 'knife-hit': 'Knife Hit', 'water-sort-3d': 'Water Sort 3D',
  };
  return bundles.filter(bundle => titles[bundle.gameId]).map((bundle, index) => ({
    id: bundle.gameId, title: titles[bundle.gameId], version: 'tutorial-1',
    buildId: bundle.buildId, entryUrl: bundle.url, tutorial: true,
    sizeBytes: bundle.bytes ?? 0, thumbnailUrl: '', manifestUrl: '',
    orientation: 'portrait', engine: 'canvas', category: 'Tutorial',
    description: '', feedOrder: index,
  }));
}

export type TutorialGameStep = 'arrow_playing' | 'knife_hit_playing' | 'water_sort_playing';

export function tutorialGameStep(game: GameItem): TutorialGameStep | null {
  if (game.id === 'arrow-puzzle' || game.id === 'game-mudsy3a8' || /arrow/i.test(game.title)) return 'arrow_playing';
  if (game.id === 'water-sort' || game.id === 'water-sort-3d') return 'water_sort_playing';
  if (/knife/i.test([game.id, game.title, game.sourceTitle ?? ''].join(' '))) return 'knife_hit_playing';
  return null;
}

/** Keep the exact catalogue objects/URLs used by the normal feed. Missing stages are skipped. */
export function orderTutorialGames(games: GameItem[], filtered: GameItem[]): GameItem[] {
  const stages: TutorialGameStep[] = ['arrow_playing', 'knife_hit_playing', 'water_sort_playing'];
  const priority = stages.map(step => games.find(game => tutorialGameStep(game) === step))
    .filter((game): game is GameItem => Boolean(game));
  const ids = new Set(priority.map(game => game.id));
  return [...priority, ...filtered.filter(game => !ids.has(game.id))];
}

export function nextTutorialGame(games: GameItem[], completed: string) {
  const steps: TutorialGameStep[] = ['arrow_playing', 'knife_hit_playing', 'water_sort_playing'];
  const current = steps.findIndex(step => step.replace('_playing', '_completed') === completed);
  if (current < 0) return null;
  for (const step of steps.slice(current + 1)) {
    const index = games.findIndex(game => tutorialGameStep(game) === step);
    if (index >= 0) return { index, step, game: games[index] };
  }
  return null;
}
