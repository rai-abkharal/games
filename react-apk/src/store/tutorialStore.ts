import { create } from 'zustand';
import { STORAGE_KEYS } from '../config/env';
import {
  readJson,
  readString,
  writeJson,
  writeString,
} from '../services/storage';

export const PRE_GAME_SNAKE_STORAGE_KEY = 'tutorials.v2.preGameSnake';
export const FIRST_TIME_TUTORIAL_STORAGE_KEY = 'tutorials.v2.firstTimeTutorial';
export const FIRST_TIME_SPLASH_STORAGE_KEY = 'tutorials.v2.firstTimeSplashCompleted';

interface PersistedTutorials {
  swipeSeen: boolean;
  joystickSeen: boolean;
  preGameSnakeSeen?: boolean;
  firstTimeTutorialCompleted?: boolean;
  homeSwipeSeen?: boolean;
  firstTimeSplashCompleted?: boolean;
}

interface TutorialState extends PersistedTutorials {
  preGameSnakeSeen: boolean;
  firstTimeTutorialCompleted: boolean;
  homeSwipeSeen: boolean;
  firstTimeSplashCompleted: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSwipeSeen: () => void;
  markJoystickSeen: () => void;
  markPreGameSnakeSeen: () => void;
  markFirstTimeTutorialCompleted: () => void;
  markFirstTimeSplashCompleted: () => void;
  markHomeSwipeSeen: () => void;
  resetTutorial: () => Promise<void>;
}

function persist(state: TutorialState) {
  const {
    swipeSeen,
    joystickSeen,
    preGameSnakeSeen,
    firstTimeTutorialCompleted,
    homeSwipeSeen,
    firstTimeSplashCompleted,
  } = state;
  writeJson(STORAGE_KEYS.tutorials, {
    swipeSeen,
    joystickSeen,
    preGameSnakeSeen,
    firstTimeTutorialCompleted,
    homeSwipeSeen,
    firstTimeSplashCompleted,
  } satisfies PersistedTutorials);
}

/**
 * First-run coach marks & pre-game onboarding.
 * Persists so each tutorial and first-time splash is never shown twice.
 */
export const useTutorialStore = create<TutorialState>((set, get) => ({
  swipeSeen: false,
  joystickSeen: false,
  preGameSnakeSeen: false,
  firstTimeTutorialCompleted: false,
  homeSwipeSeen: false,
  firstTimeSplashCompleted: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [saved, firstTimeRaw, firstTimeSplashRaw] = await Promise.all([
      readJson<PersistedTutorials>(STORAGE_KEYS.tutorials),
      readString(FIRST_TIME_TUTORIAL_STORAGE_KEY),
      readString(FIRST_TIME_SPLASH_STORAGE_KEY),
    ]);
    const firstTimeTutorialCompleted = Boolean(
      saved?.firstTimeTutorialCompleted || firstTimeRaw === '1',
    );
    const firstTimeSplashCompleted = Boolean(
      saved?.firstTimeSplashCompleted ||
        firstTimeSplashRaw === '1' ||
        firstTimeTutorialCompleted,
    );
    const preGameSnakeSeen = Boolean(
      saved?.preGameSnakeSeen || firstTimeTutorialCompleted,
    );
    set({
      swipeSeen: Boolean(saved?.swipeSeen || firstTimeTutorialCompleted),
      joystickSeen: true, // Never show joystick tutorial
      preGameSnakeSeen,
      firstTimeTutorialCompleted,
      firstTimeSplashCompleted,
      homeSwipeSeen: Boolean(saved?.homeSwipeSeen),
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

  markFirstTimeSplashCompleted: () => {
    if (get().firstTimeSplashCompleted) return;
    set({ firstTimeSplashCompleted: true });
    writeString(FIRST_TIME_SPLASH_STORAGE_KEY, '1');
    persist(get());
  },

  markHomeSwipeSeen: () => {
    if (get().homeSwipeSeen) return;
    set({ homeSwipeSeen: true });
    persist(get());
  },

  resetTutorial: async () => {
    set({
      swipeSeen: false,
      joystickSeen: true,
      preGameSnakeSeen: false,
      firstTimeTutorialCompleted: false,
      homeSwipeSeen: false,
      firstTimeSplashCompleted: false,
    });
    await Promise.all([
      writeString(PRE_GAME_SNAKE_STORAGE_KEY, '0'),
      writeString(FIRST_TIME_TUTORIAL_STORAGE_KEY, '0'),
      writeString(FIRST_TIME_SPLASH_STORAGE_KEY, '0'),
      writeJson(STORAGE_KEYS.tutorials, {
        swipeSeen: false,
        joystickSeen: true,
        preGameSnakeSeen: false,
        firstTimeTutorialCompleted: false,
        homeSwipeSeen: false,
        firstTimeSplashCompleted: false,
      }),
    ]);
  },
}));
