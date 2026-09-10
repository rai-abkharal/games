import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Bumped on every show() so an identical message re-triggers the animation. */
  nonce: number;
  durationMs: number;
  show: (message: string, durationMs?: number) => void;
  hide: () => void;
}

/** Cross-platform replacement for the native app's Toast.makeText calls. */
export const useToastStore = create<ToastState>(set => ({
  message: null,
  nonce: 0,
  durationMs: 2200,
  show: (message, durationMs = 2200) =>
    set(state => ({ message, durationMs, nonce: state.nonce + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = (message: string, durationMs?: number) =>
  useToastStore.getState().show(message, durationMs);
