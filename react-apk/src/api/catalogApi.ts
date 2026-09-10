import { API_PATHS, NETWORK } from '../config/env';
import type { GameCatalog, GameItem } from '../types/game';
import { normalizeGameUrls } from '../utils/url';
import { requestJsonWithFallback } from './http';

const HIDDEN_STATUSES = new Set(['draft', 'archived', 'deactivated']);

/**
 * Drops entries the app cannot play instead of letting one bad record break
 * the whole catalogue (the native app tolerates malformed `features` for the
 * same reason).
 */
function isPlayable(game: Partial<GameItem>): game is GameItem {
  return (
    typeof game?.id === 'string' &&
    game.id.length > 0 &&
    typeof game.title === 'string' &&
    typeof game.entryUrl === 'string' &&
    game.entryUrl.length > 0 &&
    !HIDDEN_STATUSES.has(String(game.status ?? 'published'))
  );
}

export function sanitizeCatalog(catalog: GameCatalog, baseUrl: string): GameItem[] {
  const seen = new Set<string>();
  return (catalog.games || [])
    .filter(isPlayable)
    .filter(game => {
      if (seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    })
    .map(game => normalizeGameUrls(game, baseUrl))
    .sort((a, b) => (a.feedOrder ?? 0) - (b.feedOrder ?? 0));
}

export interface CatalogResult {
  version: number;
  updatedAt?: string;
  games: GameItem[];
  baseUrl: string;
}

/** GET /api/games — the same published-only feed the native client consumes. */
export async function fetchCatalog(signal?: AbortSignal | null): Promise<CatalogResult> {
  const { data, baseUrl } = await requestJsonWithFallback<GameCatalog>(API_PATHS.catalog, {
    timeoutMs: NETWORK.catalogTimeoutMs,
    signal,
    bustCache: true,
  });
  if (!data || !Array.isArray(data.games)) {
    throw new Error('Catalogue response is malformed');
  }
  const games = sanitizeCatalog(data, baseUrl);
  if (games.length === 0) {
    throw new Error('Catalogue is empty');
  }
  return { version: Number(data.version) || 1, updatedAt: data.updatedAt, games, baseUrl };
}
