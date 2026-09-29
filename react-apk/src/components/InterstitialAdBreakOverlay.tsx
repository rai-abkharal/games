import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useAdsStore } from '../services/adManager';

/** An absolute overlay, not a new screen/Modal or a replacement game tree. */
export function InterstitialAdBreakOverlay() {
  const phase = useAdsStore(state => state.interstitialBreakPhase);
  const countdown = useAdsStore(state => state.interstitialCountdown);
  const visible = phase !== 'idle';
  const blockBack = phase === 'countdown' || phase === 'resuming';

  useEffect(() => {
    if (!blockBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [blockBack]);

  if (!visible) return null;
  return (
    <View
      testID="interstitial-ad-break"
      style={styles.overlay}
      accessibilityViewIsModal
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
    >
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">Ad Break</Text>
        {phase === 'countdown' ? (
          <>
            <Text style={styles.message}>Your game is paused</Text>
            <Text style={styles.countdown} accessibilityLiveRegion="assertive">{countdown}</Text>
          </>
        ) : (
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {phase === 'resuming' ? 'Resuming your game…' : 'Opening ad…'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: 'rgba(12, 9, 26, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { padding: 32, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 12 },
  message: { fontSize: 16, color: '#E5DDF7', textAlign: 'center' },
  countdown: { fontSize: 72, fontWeight: '800', color: '#FFFFFF', marginTop: 20 },
});
