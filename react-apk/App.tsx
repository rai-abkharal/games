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
import { useStartupStore } from './src/services/startup';

/** SplashActivity shows its brand briefly before MainActivity appears. */
const SPLASH_MS = 600;

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
  const hideSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    let mounted = true;
    void usePlayerStore.getState().hydrate();
    void useCatalogStore.getState().hydrate();
    void gamePrefetcher.restoreLaunch();
    void adManager.start();
    return () => { mounted = false; adManager.stop(); };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          {hydrated ? <RootNavigator /> : null}
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
