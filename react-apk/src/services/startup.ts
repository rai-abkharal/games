import { create } from 'zustand';

/** A ready game may reveal itself without waiting out the branding timer. */
export const useStartupStore = create<{ gameReady: boolean }>(() => ({ gameReady: false }));

export function markFirstGameReady(): void {
  if (!useStartupStore.getState().gameReady) useStartupStore.setState({ gameReady: true });
}
