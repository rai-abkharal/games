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

/** Preload duration: runs for exactly 30 seconds. */
const PRELOAD_DURATION_MS = 30_000;

/** Hard cap on waiting for the local game store before mounting the feed anyway. */
const BUNDLE_STORE_BOOT_MS = 1200;

/**
 * Enhanced startup sequence:
 * Continuously preloads as many arcade games as possible into local device
 * storage for exactly 30 seconds while displaying a modern, premium loading screen.
 * There is no fixed game-count limit: during these 30 seconds, downloads run
 * continuously in priority order so games are ready for instant zero-lag play.
 */
function App() {
  const playerHydrated = usePlayerStore(state => state.hydrated);
  const tutorialsHydrated = useTutorialStore(state => state.hydrated);
  const games = useCatalogStore(state => state.games);
  const readyBundles = useBundleStore(state => state.ready);

  const [splashDone, setSplashDone] = useState(false);
  const [bundlesSettled, setBundlesSettled] = useState(!isBundleStoreAvailable());
  const [preloadDone, setPreloadDone] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0.02);

  const hideSplash = useCallback(() => setSplashDone(true), []);

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

  // Preloading timer: runs for exactly 30 seconds
  useEffect(() => {
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
  }, []);

  const readyCount = Object.keys(readyBundles).length;
  const statusText = useMemo(() => {
    if (readyCount > 0) {
      return `Cached ${readyCount} game${readyCount > 1 ? 's' : ''} • Preloading arcade feed...`;
    }
    return undefined;
  }, [readyCount]);

  const isReadyToEnter = preloadDone;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          {playerHydrated && tutorialsHydrated && bundlesSettled ? <RootNavigator /> : null}
          {splashDone ? null : (
            <Splash
              minimumMs={PRELOAD_DURATION_MS}
              ready={isReadyToEnter}
              progress={preloadProgress}
              statusText={statusText}
              totalSeconds={30}
              onDone={hideSplash}
            />
          )}
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
