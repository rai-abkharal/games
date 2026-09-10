import { create } from 'zustand';
import { fetchCatalog } from '../api/catalogApi';
import { getActiveBaseUrl, hydrateBaseUrl, isAbortError } from '../api/http';
import { NETWORK, STORAGE_KEYS } from '../config/env';
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

let inflight: AbortController | null = null;
let hydration: Promise<void> | null = null;

/**
 * Catalogue = single source of truth for every screen. Boot renders instantly
 * from the persisted copy (MainActivity.loadCatalog step 1), then a network
 * refresh replaces it. Refreshes are throttled to 30 s, de-duplicated, and
 * abortable; a failure never discards data we already have.
 */
export const useCatalogStore = create<CatalogState>((set, get) => ({
  games: [],
  categories: [],
  status: 'booting',
  refreshing: false,
  source: 'none',
  error: null,
  lastFetchedAt: 0,

  hydrate: () => {
    if (hydration) return hydration;
    hydration = (async () => {
      const [, cached] = await Promise.all([
        hydrateBaseUrl(),
        readJson<PersistedCatalog>(STORAGE_KEYS.catalog),
      ]);
      // A network refresh started by the first screen may already have
      // landed; never let the stale cached copy overwrite it.
      if (cached && Array.isArray(cached.games) && cached.games.length && get().source === 'none') {
        const base = getActiveBaseUrl();
        const games = cached.games.map(game => normalizeGameUrls(game, base));
        set({
          games,
          categories: deriveCategories(games),
          status: 'ready',
          source: 'cache',
          lastFetchedAt: 0,
        });
      } else if (get().source === 'none') {
        set({ status: 'loading' });
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
    set({ refreshing: true, error: null, status: games.length ? 'ready' : 'loading' });
    try {
      const result = await fetchCatalog(controller.signal);
      if (controller.signal.aborted) return;
      const fetchedAt = Date.now();
      set({
        games: result.games,
        categories: deriveCategories(result.games),
        status: 'ready',
        source: 'network',
        error: null,
        lastFetchedAt: fetchedAt,
      });
      writeJson(STORAGE_KEYS.catalog, {
        version: result.version,
        updatedAt: result.updatedAt,
        games: result.games,
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
