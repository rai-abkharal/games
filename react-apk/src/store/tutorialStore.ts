import { create } from 'zustand';
import { STORAGE_KEYS } from '../config/env';
import { readJson, readString, writeJson, writeString } from '../services/storage';

export const PRE_GAME_SNAKE_STORAGE_KEY = 'tutorials.v2.preGameSnake';
export const FIRST_TIME_TUTORIAL_STORAGE_KEY = 'tutorials.v2.firstTimeTutorial';

interface PersistedTutorials {
  swipeSeen: boolean;
  joystickSeen: boolean;
  preGameSnakeSeen?: boolean;
  firstTimeTutorialCompleted?: boolean;
}

interface TutorialState extends PersistedTutorials {
  preGameSnakeSeen: boolean;
  firstTimeTutorialCompleted: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSwipeSeen: () => void;
  markJoystickSeen: () => void;
  markPreGameSnakeSeen: () => void;
  markFirstTimeTutorialCompleted: () => void;
  resetTutorial: () => Promise<void>;
}

function persist(state: TutorialState) {
  const { swipeSeen, joystickSeen, preGameSnakeSeen, firstTimeTutorialCompleted } = state;
  writeJson(STORAGE_KEYS.tutorials, {
    swipeSeen,
    joystickSeen,
    preGameSnakeSeen,
    firstTimeTutorialCompleted,
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
  firstTimeTutorialCompleted: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [saved, firstTimeRaw] = await Promise.all([
      readJson<PersistedTutorials>(STORAGE_KEYS.tutorials),
      readString(FIRST_TIME_TUTORIAL_STORAGE_KEY),
    ]);
    const firstTimeTutorialCompleted = Boolean(
      saved?.firstTimeTutorialCompleted || firstTimeRaw === '1',
    );
    const preGameSnakeSeen = Boolean(saved?.preGameSnakeSeen || firstTimeTutorialCompleted);
    set({
      swipeSeen: Boolean(saved?.swipeSeen || firstTimeTutorialCompleted),
      joystickSeen: true, // Never show joystick tutorial
      preGameSnakeSeen,
      firstTimeTutorialCompleted,
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
    get().markFirstTimeTutorialCompleted();
  },

  markFirstTimeTutorialCompleted: () => {
    if (get().firstTimeTutorialCompleted) return;
    set({
      firstTimeTutorialCompleted: true,
      preGameSnakeSeen: true,
      swipeSeen: true,
      joystickSeen: true,
    });
    writeString(PRE_GAME_SNAKE_STORAGE_KEY, '1');
    writeString(FIRST_TIME_TUTORIAL_STORAGE_KEY, '1');
    persist(get());
  },

  resetTutorial: async () => {
    set({
      swipeSeen: false,
      joystickSeen: true,
      preGameSnakeSeen: false,
      firstTimeTutorialCompleted: false,
    });
    await Promise.all([
      writeString(PRE_GAME_SNAKE_STORAGE_KEY, '0'),
      writeString(FIRST_TIME_TUTORIAL_STORAGE_KEY, '0'),
      writeJson(STORAGE_KEYS.tutorials, {
        swipeSeen: false,
        joystickSeen: true,
        preGameSnakeSeen: false,
        firstTimeTutorialCompleted: false,
      }),
    ]);
  },
}));
