import { bundledTutorialGames, nextTutorialGame, orderTutorialGames, tutorialGameStep } from '../src/feed/tutorialFlow';
import type { GameItem } from '../src/types/game';

const game = (id: string): GameItem => ({
  id, title: id, version: '1.0.0', entryUrl: 'https://games.test/' + id,
  thumbnailUrl: '', manifestUrl: '', sizeBytes: 100, orientation: 'portrait',
  engine: 'canvas', category: 'Puzzle', description: '', feedOrder: 0,
});

test('bundled onboarding works without a catalogue and cannot queue remote downloads', () => {
  const bundles = ['arrow-puzzle', 'knife-hit', 'water-sort-3d'].map(gameId => ({
    gameId, buildId: 'local-v1', entry: 'index.html',
    url: `http://127.0.0.1:18888/token/__tutorial/${gameId}/index.html`,
  }));
  const ordered = orderTutorialGames(bundledTutorialGames(bundles), []);
  expect(ordered.map(item => item.id)).toEqual(bundles.map(item => item.gameId));
  expect(ordered.every(item => item.tutorial && !item.bundleUrl)).toBe(true);
  expect(nextTutorialGame(ordered, 'arrow_completed')?.game.entryUrl).toBe(bundles[1].url);
});

test('Arrow -> Knife Hit -> Water Sort preserves the normal feed game and URL', () => {
  const water = game('water-sort-3d');
  const games = [water, game('snake-classic'), game('knife-hit'), game('arrow-puzzle')];
  const ordered = orderTutorialGames(games, games);
  expect(nextTutorialGame(ordered, 'arrow_completed')?.index).toBe(1);
  expect(nextTutorialGame(ordered, 'knife_hit_completed')).toEqual({
    index: 2, step: 'water_sort_playing', game: water,
  });
  expect(ordered[2]).toBe(water);
});

test('missing Knife Hit skips straight to Water Sort instead of loading an unrelated index 2', () => {
  const water = game('water-sort-3d');
  const games = [game('snake-classic'), water, game('arrow-puzzle')];
  const ordered = orderTutorialGames(games, games);
  expect(nextTutorialGame(ordered, 'arrow_completed')).toEqual({
    index: 1, step: 'water_sort_playing', game: water,
  });
  expect(tutorialGameStep(ordered[1])).toBe('water_sort_playing');
  expect(nextTutorialGame(ordered, 'water_sort_completed')).toBeNull();
});

test('a refreshed catalogue resolves Water Sort by identity, not its previous position', () => {
  const games = [game('snake-classic'), game('water-sort'), game('knife-hit')];
  expect(nextTutorialGame(games, 'knife_hit_completed')?.index).toBe(1);
  expect(nextTutorialGame([game('snake-classic')], 'knife_hit_completed')).toBeNull();
});
