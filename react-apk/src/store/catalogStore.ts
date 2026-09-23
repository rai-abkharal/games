import { create } from 'zustand';
import { fetchCatalog } from '../api/catalogApi';
import { getActiveBaseUrl, hydrateBaseUrl, isAbortError } from '../api/http';
import { NETWORK, STORAGE_KEYS } from '../config/env';
import { BUNDLED_GAMES, BUNDLED_GAME_IDS } from '../config/bundledGames';
import { readJson, writeJson } from '../services/storage';
import type { GameItem } from '../types/game';
import { displayCategory } from '../utils/misc';
import { normalizeGameUrls } from '../utils/url';

interface PersistedCatalog {
  version: number;
  updatedAt?: string;
  games: GameItem[];
  fetchedAt: number;
}

export type CatalogStatus = 'booting' | 'loading' | 'ready' | 'error';

interface CatalogState {
  games: GameItem[];
  /** Case-insensitive display categories, in first-seen feed order. */
  categories: string[];
  status: CatalogStatus;
  /** True while a network refresh is running (may coexist with `ready`). */
  refreshing: boolean;
  /** Where the current `games` came from. */
  source: 'none' | 'cache' | 'network';
  error: string | null;
  lastFetchedAt: number;
  hydrate: () => Promise<void>;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  cancel: () => void;
  getGame: (id: string) => GameItem | undefined;
}

function deriveCategories(games: GameItem[]): string[] {
  const seen = new Map<string, string>();
  for (const game of games) {
    const label = displayCategory(game.category);
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return Array.from(seen.values());
}

function mergeWithBundledGames(serverGames: GameItem[]): GameItem[] {
  const serverOnly = serverGames.filter(g => !BUNDLED_GAME_IDS.has(g.id));
  return [...BUNDLED_GAMES, ...serverOnly];
}

let inflight: AbortController | null = null;
let hydration: Promise<void> | null = null;

/**
 * Catalogue = single source of truth for every screen.
 * Initializes immediately with the 20 APK-bundled games as the first 20 items (indices 0-19),
 * ensuring complete offline availability without any server dependency.
 */
export const useCatalogStore = create<CatalogState>((set, get) => ({
  games: BUNDLED_GAMES,
  categories: deriveCategories(BUNDLED_GAMES),
  status: 'ready',
  refreshing: false,
  source: 'cache',
  error: null,
  lastFetchedAt: 0,

  hydrate: () => {
    if (hydration) return hydration;
    hydration = (async () => {
      const [, cached] = await Promise.all([
        hydrateBaseUrl(),
        readJson<PersistedCatalog>(STORAGE_KEYS.catalog),
      ]);
      if (cached && Array.isArray(cached.games) && cached.games.length) {
        const base = getActiveBaseUrl();
        const games = mergeWithBundledGames(cached.games.map(game => normalizeGameUrls(game, base)));
        set({
          games,
          categories: deriveCategories(games),
          status: 'ready',
          source: 'cache',
          lastFetchedAt: 0,
        });
      }
      await get().refresh({ force: true });
    })();
    return hydration;
  },

  refresh: async ({ force = false } = {}) => {
    const { lastFetchedAt, games } = get();
    if (inflight) return;
    if (!force && Date.now() - lastFetchedAt < NETWORK.catalogRefreshIntervalMs) return;

    const controller = new AbortController();
    inflight = controller;
    set({ refreshing: true, error: null, status: 'ready' });
    try {
      const result = await fetchCatalog(controller.signal);
      if (controller.signal.aborted) return;
      const fetchedAt = Date.now();
      const mergedGames = mergeWithBundledGames(result.games);
      set({
        games: mergedGames,
        categories: deriveCategories(mergedGames),
        status: 'ready',
        source: 'network',
        error: null,
        lastFetchedAt: fetchedAt,
      });
      writeJson(STORAGE_KEYS.catalog, {
        version: result.version,
        updatedAt: result.updatedAt,
        games: mergedGames,
        fetchedAt,
      } satisfies PersistedCatalog);
    } catch (error) {
      if (isAbortError(error)) return;
      const message = error instanceof Error ? error.message : 'Unable to load games';
      set(state => ({
        error: message,
        status: state.games.length ? 'ready' : 'error',
        // Back off for the throttle window so a dead backend isn't hammered on
        // every focus/resume; a user-initiated retry passes force=true.
        lastFetchedAt: state.games.length ? Date.now() : 0,
      }));
    } finally {
      if (inflight === controller) inflight = null;
      set({ refreshing: false });
    }
  },

  cancel: () => {
    inflight?.abort();
    inflight = null;
  },

  getGame: id => get().games.find(game => game.id === id),
}));
