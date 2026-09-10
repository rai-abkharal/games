import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../store/toastStore';
import { HUD } from '../theme/themes';

/** Bottom toast rendered once at the root; driven entirely by the toast store. */
export function Toast() {
  const message = useToastStore(state => state.message);
  const nonce = useToastStore(state => state.nonce);
  const durationMs = useToastStore(state => state.durationMs);
  const hide = useToastStore(state => state.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.stopAnimation();
    Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) hide();
      });
    }, durationMs);
    return () => clearTimeout(timer);
  }, [message, nonce, durationMs, opacity, hide]);

  if (!message) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity, bottom: insets.bottom + 84 }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: HUD.glassBorder,
  },
  text: { color: HUD.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
