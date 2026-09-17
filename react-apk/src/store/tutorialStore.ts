import { create } from 'zustand';
import { STORAGE_KEYS } from '../config/env';
import { readJson, readString, writeJson, writeString } from '../services/storage';

export const PRE_GAME_SNAKE_STORAGE_KEY = 'tutorials.v2.preGameSnake';

interface PersistedTutorials {
  swipeSeen: boolean;
  joystickSeen: boolean;
  preGameSnakeSeen?: boolean;
}

interface TutorialState extends PersistedTutorials {
  preGameSnakeSeen: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSwipeSeen: () => void;
  markJoystickSeen: () => void;
  markPreGameSnakeSeen: () => void;
}

function persist(state: TutorialState) {
  const { swipeSeen, joystickSeen, preGameSnakeSeen } = state;
  writeJson(STORAGE_KEYS.tutorials, {
    swipeSeen,
    joystickSeen,
    preGameSnakeSeen,
  } satisfies PersistedTutorials);
}

/**
 * First-run coach marks & pre-game onboarding.
 * Persists so each tutorial is never shown twice.
 */
export const useTutorialStore = create<TutorialState>((set, get) => ({
  swipeSeen: false,
  joystickSeen: false,
  preGameSnakeSeen: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [saved, preGameRaw] = await Promise.all([
      readJson<PersistedTutorials>(STORAGE_KEYS.tutorials),
      readString(PRE_GAME_SNAKE_STORAGE_KEY),
    ]);
    const preGameSnakeSeen = Boolean(saved?.preGameSnakeSeen || preGameRaw === '1');
    set({
      swipeSeen: Boolean(saved?.swipeSeen || preGameSnakeSeen),
      joystickSeen: Boolean(saved?.joystickSeen || preGameSnakeSeen),
      preGameSnakeSeen,
      hydrated: true,
    });
  },

  markSwipeSeen: () => {
    if (get().swipeSeen) return;
    set({ swipeSeen: true });
    persist(get());
  },

  markJoystickSeen: () => {
    if (get().joystickSeen) return;
    set({ joystickSeen: true });
    persist(get());
  },

  markPreGameSnakeSeen: () => {
    if (get().preGameSnakeSeen) return;
    set({ preGameSnakeSeen: true, swipeSeen: true, joystickSeen: true });
    writeString(PRE_GAME_SNAKE_STORAGE_KEY, '1');
    persist(get());
  },
}));
