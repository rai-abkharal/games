import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Splash } from './src/components/Splash';
import { Toast } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { adManager } from './src/services/adManager';
import { useCatalogStore } from './src/store/catalogStore';
import { usePlayerStore } from './src/store/playerStore';
import { gamePrefetcher } from './src/services/gamePrefetcher';
import { isBundleStoreAvailable, startBundleStore, stopBundleStore } from './src/services/gameBundles';
import { useStartupStore } from './src/services/startup';

/** SplashActivity shows its brand briefly before MainActivity appears. */
const SPLASH_MS = 600;

/** Hard cap on waiting for the local game store before mounting the feed anyway. */
const BUNDLE_STORE_BOOT_MS = 1200;

/**
 * Boot: hydrate the player profile (a few ms from storage) and kick off the
 * catalogue + ads bootstrap in parallel. The feed mounts as soon as the
 * profile is known — underneath the splash — so the first game is already
 * loading while the brand animation plays.
 */
function App() {
  const hydrated = usePlayerStore(state => state.hydrated);
  const gameReady = useStartupStore(state => state.gameReady);
  const [splashDone, setSplashDone] = useState(false);
  // The local game store answers "which builds can I play from disk?", and the
  // first page picks its source once, when its WebView is created. Waiting the
  // few milliseconds it takes to come up is what lets the very first game open
  // from local files instead of the network — but it is never allowed to hold
  // the app back, so a slow or missing store falls through on a timer.
  const [bundlesSettled, setBundlesSettled] = useState(!isBundleStoreAvailable());
  const hideSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    let mounted = true;
    void usePlayerStore.getState().hydrate();
    void useCatalogStore.getState().hydrate();
    void gamePrefetcher.restoreLaunch();
    void adManager.start();
    const settle = () => {
      if (mounted) setBundlesSettled(true);
    };
    const timer = setTimeout(settle, BUNDLE_STORE_BOOT_MS);
    void startBundleStore().finally(settle);
    return () => {
      mounted = false;
      clearTimeout(timer);
      adManager.stop();
      stopBundleStore();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          {hydrated && bundlesSettled ? <RootNavigator /> : null}
          {splashDone ? null : <Splash minimumMs={SPLASH_MS} ready={gameReady} onDone={hideSplash} />}
        </View>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
});

export default App;
