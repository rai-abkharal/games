import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Splash } from './src/components/Splash';
import { Toast } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { adManager, useAdsStore } from './src/services/adManager';
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
  useDownloadStore,
} from './src/services/gameBundles';
import { useStartupStore } from './src/services/startup';

/** Hard cap on waiting for initial preload before entering the app anyway (10s max). */
const MAX_PRELOAD_WAIT_MS = 10_000;

/** Minimum display time so the loading bar animation is visible and smooth. */
const MINIMUM_SPLASH_MS = 1000;

/** Hard cap on waiting for the local game store before mounting the feed anyway. */
const BUNDLE_STORE_BOOT_MS = 1200;

/**
 * Boot: hydrate player profile, catalogue, and remote config.
 * Stealthily pre-downloads the top N games (controlled by Admin) into local
 * device storage while displaying an attractive gaming loading screen.
 * When the player reaches the tutorial or feed, those games are already 100%
 * cached on disk for instant, zero-lag gameplay.
 */
function App() {
  const playerHydrated = usePlayerStore(state => state.hydrated);
  const tutorialsHydrated = useTutorialStore(state => state.hydrated);
  const games = useCatalogStore(state => state.games);
  const catalogStatus = useCatalogStore(state => state.status);
  const initialPreloadCount = useAdsStore(state => state.initialPreloadGameCount);
  const readyBundles = useBundleStore(state => state.ready);
  const activeDownloads = useDownloadStore(state => state.active);
  const gameReady = useStartupStore(state => state.gameReady);

  const [splashDone, setSplashDone] = useState(false);
  const [bundlesSettled, setBundlesSettled] = useState(!isBundleStoreAvailable());
  const [preloadDone, setPreloadDone] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0.08);

  const hideSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    let mounted = true;
    void usePlayerStore.getState().hydrate();
    void useTutorialStore.getState().hydrate();
    void useCatalogStore.getState().hydrate();
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

  // Calculate target games to preload based on Admin configuration
  const targetCount = useMemo(() => {
    const desired = initialPreloadCount || 5;
    if (!games.length) return desired;
    return Math.max(1, Math.min(games.length, desired));
  }, [games.length, initialPreloadCount]);

  const targetGames = useMemo(() => games.slice(0, targetCount), [games, targetCount]);

  // Trigger priority pre-download of the target first N games
  useEffect(() => {
    if (!bundlesSettled || !games.length || !isBundleStoreAvailable()) return;
    syncBundles(games, (_game, index) =>
      index < targetCount ? BundlePriority.current : BundlePriority.rest,
    );
  }, [bundlesSettled, games, targetCount]);

  // Track progress and completion of target games
  useEffect(() => {
    if (!isBundleStoreAvailable()) {
      // Non-native / test environment: smoothly progress to 100%
      const timer = setTimeout(() => {
        setPreloadProgress(1);
        setPreloadDone(true);
      }, 400);
      return () => clearTimeout(timer);
    }

    if (!targetGames.length) {
      if (catalogStatus === 'error') {
        setPreloadProgress(1);
        setPreloadDone(true);
      }
      return;
    }

    const readyCount = targetGames.filter(g => Boolean(readyBundles[g.id])).length;
    const partialFractions = targetGames.reduce(
      (sum, g) => sum + (activeDownloads[g.id]?.fraction ?? 0),
      0,
    );

    const calculated = (readyCount + partialFractions) / targetCount;
    // Map to 15%..100% (with initial 15% reserved for catalog hydration)
    const normalized = Math.min(1, Math.max(0.15, 0.15 + 0.85 * calculated));
    setPreloadProgress(normalized);

    if (readyCount >= targetCount) {
      setPreloadProgress(1);
      setPreloadDone(true);
    }
  }, [activeDownloads, catalogStatus, readyBundles, targetCount, targetGames]);

  // Safety timeout: never let the loading screen hold the user longer than MAX_PRELOAD_WAIT_MS
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreloadProgress(1);
      setPreloadDone(true);
    }, MAX_PRELOAD_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const isReadyToEnter = preloadDone || gameReady;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          {playerHydrated && tutorialsHydrated && bundlesSettled ? <RootNavigator /> : null}
          {splashDone ? null : (
            <Splash
              minimumMs={MINIMUM_SPLASH_MS}
              ready={isReadyToEnter}
              progress={preloadProgress}
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
