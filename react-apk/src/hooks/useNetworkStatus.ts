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
