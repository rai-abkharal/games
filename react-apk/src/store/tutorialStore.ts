import { create } from 'zustand';
import { STORAGE_KEYS } from '../config/env';
import { readJson, writeJson } from '../services/storage';

interface PersistedTutorials {
  swipeSeen: boolean;
  joystickSeen: boolean;
}

interface TutorialState extends PersistedTutorials {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSwipeSeen: () => void;
  markJoystickSeen: () => void;
}

function persist(state: TutorialState) {
  const { swipeSeen, joystickSeen } = state;
  writeJson(STORAGE_KEYS.tutorials, { swipeSeen, joystickSeen } satisfies PersistedTutorials);
}

/**
 * First-run coach marks. Each flag flips exactly once, the first time the
 * player dismisses (or performs) the gesture being taught, and persists so a
 * tutorial is never seen twice. Kept apart from the player profile so the
 * persisted player/settings schemas stay untouched.
 */
export const useTutorialStore = create<TutorialState>((set, get) => ({
  swipeSeen: false,
  joystickSeen: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const saved = await readJson<PersistedTutorials>(STORAGE_KEYS.tutorials);
    set({
      swipeSeen: Boolean(saved?.swipeSeen),
      joystickSeen: Boolean(saved?.joystickSeen),
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
}));
