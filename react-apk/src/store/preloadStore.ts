import { create } from 'zustand';
import { DEFAULT_PRELOAD_CONFIG, fetchPreloadConfig } from '../api/preloadApi';

interface PreloadState {
  initialPreloadGameCount: number;
  hydrate: () => Promise<void>;
}

export const usePreloadStore = create<PreloadState>(set => ({
  initialPreloadGameCount: DEFAULT_PRELOAD_CONFIG.initialPreloadGameCount,
  hydrate: async () => {
    try {
      const config = await fetchPreloadConfig();
      set({ initialPreloadGameCount: config.initialPreloadGameCount });
    } catch (_) {}
  },
}));
