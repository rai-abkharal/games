import { create } from 'zustand';
import { GAMEPLAY, STORAGE_KEYS } from '../config/env';
import { readJson, writeJson } from '../services/storage';
import type { ThemeId } from '../theme/themes';
import { uuid } from '../utils/misc';

interface PersistedPlayer {
  playerId: string;
  coins: number;
  highScores: Record<string, number>;
  savedLevels: Record<string, number>;
  favorites: string[];
  lastPlayedGameId: string | null;
}

interface PersistedSettings {
  soundMuted: boolean;
  vibrationEnabled: boolean;
  themeId: ThemeId;
}

interface PlayerState extends PersistedPlayer, PersistedSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addCoins: (amount: number) => number;
  saveHighScore: (gameId: string, score: number) => boolean;
  getHighScore: (gameId: string) => number;
  saveLevel: (gameId: string, level: number) => void;
  getSavedLevel: (gameId: string) => number;
  toggleFavorite: (gameId: string) => boolean;
  isFavorite: (gameId: string) => boolean;
  setLastPlayed: (gameId: string) => void;
  setSoundMuted: (muted: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setTheme: (themeId: ThemeId) => void;
}

const newPlayerId = () => `Guest_${uuid().slice(0, 5).toUpperCase()}`;

function persistPlayer(state: PlayerState) {
  const { playerId, coins, highScores, savedLevels, favorites, lastPlayedGameId } = state;
  writeJson(STORAGE_KEYS.player, {
    playerId,
    coins,
    highScores,
    savedLevels,
    favorites,
    lastPlayedGameId,
  } satisfies PersistedPlayer);
}

function persistSettings(state: PlayerState) {
  const { soundMuted, vibrationEnabled, themeId } = state;
  writeJson(STORAGE_KEYS.settings, { soundMuted, vibrationEnabled, themeId } satisfies PersistedSettings);
}

/**
 * PlayerProgressManager + the user prefs that lived in SharedPreferences:
 * wallet, per-game high score & level, favourites, last played, sound,
 * vibration and theme. Everything is kept in memory and mirrored to storage.
 */
export const usePlayerStore = create<PlayerState>((set, get) => ({
  playerId: '',
  coins: GAMEPLAY.starterCoins,
  highScores: {},
  savedLevels: {},
  favorites: [],
  lastPlayedGameId: null,
  soundMuted: false,
  vibrationEnabled: true,
  themeId: 'pure_white',
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [player, settings] = await Promise.all([
      readJson<PersistedPlayer>(STORAGE_KEYS.player),
      readJson<PersistedSettings>(STORAGE_KEYS.settings),
    ]);
    set({
      playerId: player?.playerId || newPlayerId(),
      coins: typeof player?.coins === 'number' ? player.coins : GAMEPLAY.starterCoins,
      highScores: player?.highScores ?? {},
      savedLevels: player?.savedLevels ?? {},
      favorites: Array.isArray(player?.favorites) ? player.favorites : [],
      lastPlayedGameId: player?.lastPlayedGameId ?? null,
      soundMuted: settings?.soundMuted ?? false,
      vibrationEnabled: settings?.vibrationEnabled ?? true,
      themeId: settings?.themeId ?? 'pure_white',
      hydrated: true,
    });
    if (!player?.playerId) persistPlayer(get());
  },

  addCoins: amount => {
    const coins = get().coins + amount;
    set({ coins });
    persistPlayer(get());
    return coins;
  },

  saveHighScore: (gameId, score) => {
    if (score <= (get().highScores[gameId] ?? 0)) return false;
    set(state => ({ highScores: { ...state.highScores, [gameId]: score } }));
    persistPlayer(get());
    return true;
  },

  getHighScore: gameId => get().highScores[gameId] ?? 0,

  saveLevel: (gameId, level) => {
    if (level <= (get().savedLevels[gameId] ?? 1)) return;
    set(state => ({ savedLevels: { ...state.savedLevels, [gameId]: level } }));
    persistPlayer(get());
  },

  getSavedLevel: gameId => get().savedLevels[gameId] ?? 1,

  toggleFavorite: gameId => {
    const current = get().favorites;
    const isFav = !current.includes(gameId);
    set({ favorites: isFav ? [...current, gameId] : current.filter(id => id !== gameId) });
    persistPlayer(get());
    return isFav;
  },

  isFavorite: gameId => get().favorites.includes(gameId),

  setLastPlayed: gameId => {
    if (get().lastPlayedGameId === gameId) return;
    set({ lastPlayedGameId: gameId });
    persistPlayer(get());
  },

  setSoundMuted: soundMuted => {
    set({ soundMuted });
    persistSettings(get());
  },

  setVibrationEnabled: vibrationEnabled => {
    set({ vibrationEnabled });
    persistSettings(get());
  },

  setTheme: themeId => {
    set({ themeId });
    persistSettings(get());
  },
}));
