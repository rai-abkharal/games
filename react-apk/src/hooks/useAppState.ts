import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Fires `onChange(isActive)` on foreground/background transitions only
 * (not on every intermediate 'inactive' tick) and always unsubscribes.
 */
export function useAppStateChange(onChange: (active: boolean) => void): void {
  const callback = useRef(onChange);
  callback.current = onChange;
  const last = useRef<boolean>(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      const active = status === 'active';
      if (active === last.current) return;
      last.current = active;
      callback.current(active);
    });
    return () => sub.remove();
  }, []);
}
