import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { GamepadIcon } from './feed/NavIcons';

interface Props {
  /** How long the splash stays before fading (SplashActivity: 1200 ms). */
  minimumMs: number;
  onDone: () => void;
}

/**
 * activity_splash.xml as an overlay: the brand block slides up and fades in
 * over 800 ms, the feed boots underneath, and after `minimumMs` the splash
 * fades away — so the first game is often already running when it does.
 */
export function Splash({ minimumMs, onDone }: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onDoneRef.current();
      });
    }, minimumMs);
    return () => clearTimeout(timer);
  }, [enter, fade, minimumMs]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [50, 0] });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      <Animated.View style={[styles.brand, { opacity: enter, transform: [{ translateY }] }]}>
        <GamepadIcon size={96} color="#6366F1" />
        <Text style={styles.title} allowFontScaling={false}>
          SWIPE PLAY
        </Text>
        <Text style={styles.subtitle} allowFontScaling={false}>
          120 FPS INSTANT ACTION ARCADE
        </Text>
      </Animated.View>
      <View style={styles.status}>
        <ActivityIndicator size={36} color="#6366F1" />
        <Text style={styles.statusText}>Warming up 60 FPS Canvas Engine...</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    padding: 32,
    zIndex: 100,
    elevation: 100,
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.64,
  },
  subtitle: {
    marginTop: 8,
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  status: {
    alignItems: 'center',
  },
  statusText: {
    marginTop: 16,
    color: '#64748B',
    fontSize: 12,
  },
});
