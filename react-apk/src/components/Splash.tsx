import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

const APP_LOGO_IMAGE = require('../assets/images/app_logo.png');

interface Props {
  /** How long the splash stays before fading (SplashActivity: 1200 ms). */
  minimumMs: number;
  ready?: boolean;
  onDone: () => void;
}

/**
 * activity_splash.xml as an overlay: the brand block slides up and fades in
 * over 800 ms, the feed boots underneath, and after `minimumMs` the splash
 * fades away — so the first game is often already running when it does.
 */
export function Splash({ minimumMs, ready = false, onDone }: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const fading = useRef(false);
  const reveal = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
  }, [fade]);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => enter.stopAnimation();
  }, [enter]);

  useEffect(() => {
    const timer = setTimeout(reveal, minimumMs);
    return () => { clearTimeout(timer); fading.current = false; fade.stopAnimation(); };
  }, [fade, minimumMs, reveal]);

  useEffect(() => { if (ready) reveal(); }, [ready, reveal]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [50, 0] });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      <Animated.View style={[styles.brand, { opacity: enter, transform: [{ translateY }] }]}>
        <Image source={APP_LOGO_IMAGE} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.title} allowFontScaling={false}>
          EiBi Games
        </Text>
        <Text style={styles.subtitle} allowFontScaling={false}>
          SWIPE & PLAY
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
  logoImage: {
    width: 104,
    height: 104,
    borderRadius: 22,
    shadowColor: '#A855F7',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  title: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 6,
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
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
