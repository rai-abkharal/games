import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Splash } from './src/components/Splash';
import { Toast } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { adManager } from './src/services/adManager';
import { useCatalogStore } from './src/store/catalogStore';
import { usePlayerStore } from './src/store/playerStore';

/** SplashActivity shows its brand for 1200 ms before MainActivity appears. */
const SPLASH_MS = 1200;

/**
 * Boot: hydrate the player profile (a few ms from storage) and kick off the
 * catalogue + ads bootstrap in parallel. The feed mounts as soon as the
 * profile is known — underneath the splash — so the first game is already
 * loading while the brand animation plays.
 */
function App() {
  const hydrated = usePlayerStore(state => state.hydrated);
  const [splashDone, setSplashDone] = useState(false);
  const hideSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    void usePlayerStore.getState().hydrate();
    void useCatalogStore.getState().hydrate();
    void adManager.start();
    return () => adManager.stop();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {hydrated ? <RootNavigator /> : null}
        {splashDone ? null : <Splash minimumMs={SPLASH_MS} onDone={hideSplash} />}
      </View>
      <Toast />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
});

export default App;
