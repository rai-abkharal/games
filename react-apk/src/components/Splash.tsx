import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

const APP_LOGO_IMAGE = require('../assets/images/app_logo.png');

interface Props {
  /** How long the splash stays before fading (SplashActivity: 1200 ms). */
  minimumMs?: number;
  ready?: boolean;
  onDone: () => void;
  /** Normalized progress from 0.0 to 1.0. */
  progress?: number;
  /** Custom status caption. If omitted, picks from dynamic engine messages. */
  statusText?: string;
}

const ENGINE_MESSAGES = [
  'Initializing 60 FPS Canvas Engine...',
  'Buffering arcade assets & audio...',
  'Calibrating touch input response...',
  'Optimizing local game storage...',
  'Almost ready to play...',
];

function getMessageForProgress(fraction: number): string {
  if (fraction >= 1) return 'Ready to play!';
  const index = Math.min(
    ENGINE_MESSAGES.length - 1,
    Math.floor(fraction * ENGINE_MESSAGES.length),
  );
  return ENGINE_MESSAGES[index];
}

export function Splash({
  minimumMs = 1200,
  ready = false,
  onDone,
  progress = 0,
  statusText,
}: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
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

  // Entrance slide up & fade in
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    return () => enter.stopAnimation();
  }, [enter]);

  // Animate progress smoothly towards target progress
  useEffect(() => {
    if (progress <= 0) return;
    Animated.timing(progressAnim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progressAnim.stopAnimation();
  }, [progress, progressAnim]);

  // Minimum duration fallback
  useEffect(() => {
    const timer = setTimeout(reveal, minimumMs);
    return () => {
      clearTimeout(timer);
      fading.current = false;
      fade.stopAnimation();
    };
  }, [fade, minimumMs, reveal]);

  // When ready signal arrives, reveal immediately
  useEffect(() => {
    if (ready) reveal();
  }, [ready, reveal]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const barWidthPercent = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const percentNumber = Math.round(clampedProgress * 100);
  const activeMessage = statusText || getMessageForProgress(clampedProgress);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      <Animated.View style={[styles.brand, { opacity: enter, transform: [{ translateY }] }]}>
        <View style={styles.logoContainer}>
          <Image source={APP_LOGO_IMAGE} style={styles.logoImage} resizeMode="contain" />
          <View style={styles.logoGlowRing} />
        </View>
        <Text style={styles.title} allowFontScaling={false}>
          EiBi Games
        </Text>
        <Text style={styles.subtitle} allowFontScaling={false}>
          SWIPE & PLAY
        </Text>
      </Animated.View>

      <View style={styles.loadingContainer}>
        {/* Progress percent counter */}
        <View style={styles.percentRow}>
          <Text style={styles.percentText} allowFontScaling={false}>
            {`${percentNumber}%`}
          </Text>
        </View>

        {/* Outer neon progress track */}
        <View style={styles.track}>
          <Animated.View style={[styles.bar, { width: barWidthPercent }]}>
            <View style={styles.barGlow} />
          </Animated.View>
        </View>

        {/* Dynamic engine status text */}
        <Text style={styles.statusText} allowFontScaling={false}>
          {activeMessage}
        </Text>
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
    backgroundColor: '#070B19',
    paddingHorizontal: 32,
    paddingBottom: 56,
    zIndex: 100,
    elevation: 100,
    justifyContent: 'space-between',
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 108,
    height: 108,
    borderRadius: 24,
    shadowColor: '#A855F7',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  logoGlowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  title: {
    marginTop: 22,
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 6,
    color: '#C084FC',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 24,
  },
  percentRow: {
    marginBottom: 8,
    alignSelf: 'flex-end',
    paddingRight: 8,
  },
  percentText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  track: {
    width: '100%',
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bar: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 999,
  },
  barGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#38BDF8',
    opacity: 0.35,
  },
  statusText: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
