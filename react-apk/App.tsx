import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Splash } from './src/components/Splash';
import { Toast } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { adManager } from './src/services/adManager';
import { usePreloadStore } from './src/store/preloadStore';
import { useCatalogStore } from './src/store/catalogStore';
import { usePlayerStore } from './src/store/playerStore';
import { useTutorialStore } from './src/store/tutorialStore';
import {
  BundlePriority,
  isBundleStoreAvailable,
  startBundleStore,
  stopBundleStore,
  syncBundles,
  useBundleStore,
} from './src/services/gameBundles';

/** Preload duration: runs for approximately 5 seconds on first launch. */
const PRELOAD_DURATION_MS = 5_000;

/** Hard cap on waiting for the local game store before mounting the feed anyway. */
const BUNDLE_STORE_BOOT_MS = 1200;

/**
 * Enhanced startup sequence:
 * Quickly unpacks and warms the 20 native APK games into local device storage
 * in approximately 5 seconds while displaying a modern, premium loading screen.
 */
function App() {
  const playerHydrated = usePlayerStore(state => state.hydrated);
  const tutorialsHydrated = useTutorialStore(state => state.hydrated);
  const firstTimeSplashCompleted = useTutorialStore(
    state => state.firstTimeSplashCompleted,
  );
  const games = useCatalogStore(state => state.games);
  const readyBundles = useBundleStore(state => state.ready);

  const [splashDone, setSplashDone] = useState(false);
  const [bundlesSettled, setBundlesSettled] = useState(!isBundleStoreAvailable());
  const [preloadDone, setPreloadDone] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0.02);

  const hideSplash = useCallback(() => {
    setSplashDone(true);
    useTutorialStore.getState().markFirstTimeSplashCompleted();
  }, []);

  useEffect(() => {
    let mounted = true;
    void usePlayerStore.getState().hydrate();
    void useTutorialStore.getState().hydrate();
    void useCatalogStore.getState().hydrate();
    void usePreloadStore.getState().hydrate();
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

  // Continuously download as many games as possible without a fixed count limit
  useEffect(() => {
    if (!bundlesSettled || !games.length || !isBundleStoreAvailable()) return;
    syncBundles(games, (_game, index) => {
      if (index === 0) return BundlePriority.current;
      if (index < 3) return BundlePriority.next;
      if (index < 10) return BundlePriority.near;
      return BundlePriority.rest;
    });
  }, [bundlesSettled, games]);

  // Preloading timer: runs for exactly 30 seconds ONLY on the very first app launch (like first-time tutorial)
  useEffect(() => {
    if (!tutorialsHydrated) return;

    // Returning user: first-time 30-second splash preloading is already done
    if (firstTimeSplashCompleted) {
      setPreloadDone(true);
      setSplashDone(true);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const fraction = Math.min(1.0, elapsed / PRELOAD_DURATION_MS);
      setPreloadProgress(fraction);
      if (elapsed >= PRELOAD_DURATION_MS) {
        clearInterval(interval);
        setPreloadDone(true);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [tutorialsHydrated, firstTimeSplashCompleted]);

  const readyCount = Object.keys(readyBundles).length;
  const statusText = useMemo(() => {
    if (readyCount > 0) {
      return `Loaded ${readyCount} native game${readyCount > 1 ? 's' : ''} • Ready to play!`;
    }
    return undefined;
  }, [readyCount]);

  const isReadyToEnter = preloadDone;
  // Splash is only shown once on the very first app launch (like the first-time tutorial)
  const shouldShowSplash =
    !splashDone && tutorialsHydrated && !firstTimeSplashCompleted;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          {playerHydrated && tutorialsHydrated && bundlesSettled ? (
            <View style={styles.root} pointerEvents={shouldShowSplash ? 'none' : 'auto'}
              accessibilityElementsHidden={shouldShowSplash}
              importantForAccessibility={shouldShowSplash ? 'no-hide-descendants' : 'auto'}>
              <RootNavigator />
            </View>
          ) : null}
          {shouldShowSplash ? (
            <Splash
              minimumMs={PRELOAD_DURATION_MS}
              ready={isReadyToEnter}
              progress={preloadProgress}
              statusText={statusText}
              totalSeconds={5}
              onDone={hideSplash}
            />
          ) : null}
        </View>
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F3FC' },
});

export default App;
