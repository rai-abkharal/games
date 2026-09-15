import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * `true` = known offline, `false` = online or unknown. We treat "unknown" as
 * online so a slow NetInfo probe never blocks a request that would succeed.
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);
  return offline;
}

/**
 * `true` when the connection costs the player money or battery to use heavily —
 * cellular, or anything the platform flags as expensive. Unknown counts as
 * unmetered so a slow probe never needlessly throttles a download.
 *
 * Only speculative bundle downloads consult this. The game the player is
 * actually on is never rate-limited on any connection.
 */
export function useIsMetered(): boolean {
  const [metered, setMetered] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const expensive = (state.details as { isConnectionExpensive?: boolean } | null)
        ?.isConnectionExpensive;
      setMetered(state.type === 'cellular' || expensive === true);
    });
    return unsubscribe;
  }, []);
  return metered;
}
