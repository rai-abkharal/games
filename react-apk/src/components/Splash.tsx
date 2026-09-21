import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

const APP_LOGO_IMAGE = require('../assets/images/app_logo.png');

interface Props {
  /** How long the splash stays before fading. */
  minimumMs?: number;
  ready?: boolean;
  onDone: () => void;
  /** Normalized progress from 0.0 to 1.0. */
  progress?: number;
  /** Custom status caption. If omitted, picks from dynamic engine messages. */
  statusText?: string;
  /** Total preload seconds for countdown display (default: 30). */
  totalSeconds?: number;
}

const LOGO_COLORS = {
  bg: '#120524',
  ambient: '#2A094C',
  violetGlow: '#B266FF',
  goldGlow: '#F2C200',
  goldLight: '#FFF276',
  card: '#230B40',
  textPrimary: '#FFFFFF',
  textSecondary: '#D9D3EE',
  lavenderSub: '#C084FC',
  trackBorder: 'rgba(178, 102, 255, 0.32)',
};

const ENGINE_MESSAGES = [
  'Initializing 60 FPS Canvas Engine...',
  'Buffering arcade assets & audio...',
  'Calibrating touch input response...',
  'Optimizing local game storage...',
  'Almost ready to play...',
];

function getMessageForProgress(fraction: number): string {
  if (fraction >= 1) return 'Ready to play! Entering arcade...';
  const index = Math.min(
    ENGINE_MESSAGES.length - 1,
    Math.floor(fraction * ENGINE_MESSAGES.length),
  );
  return ENGINE_MESSAGES[index];
}

export function Splash({
  minimumMs = 30000,
  ready = false,
  onDone,
  progress = 0,
  statusText,
  totalSeconds = 30,
}: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const fading = useRef(false);

  const reveal = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      onDoneRef.current();
    });
  }, [fade]);

  // Entrance slide up & fade in
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => enter.stopAnimation();
  }, [enter]);

  // Continuous glowing aura and orbital animation
  useEffect(() => {
    if ((globalThis as any).process?.env?.NODE_ENV === 'test') {
      return;
    }

    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const rotateAnim = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    pulseAnim.start();
    rotateAnim.start();

    return () => {
      pulseAnim.stop();
      rotateAnim.stop();
    };
  }, [pulse, rotate]);

  // Animate progress smoothly towards target
  useEffect(() => {
    if (progress <= 0) return;
    Animated.timing(progressAnim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 250,
      easing: Easing.out(Easing.quad),
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

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const barWidthPercent = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const percentNumber = Math.round(clampedProgress * 100);
  const remainingSeconds = Math.max(0, Math.ceil(totalSeconds * (1 - clampedProgress)));
  const activeMessage = statusText || getMessageForProgress(clampedProgress);

  // Dynamic glow transformations
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.26],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.8],
  });
  const goldHaloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.2, 0.96],
  });
  const goldHaloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.55],
  });
  const spinDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const reverseSpinDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      {/* Background Ambient Violet Lighting */}
      <View style={styles.ambientBackdrop} />

      {/* Prominent Centered Brand & Glowing Animated Logo */}
      <Animated.View
        style={[styles.brand, { opacity: enter, transform: [{ translateY }] }]}
      >
        <View style={styles.logoWrapper}>
          {/* Layer 1: Outer ambient violet pulsing aura */}
          <Animated.View
            style={[
              styles.glowAura,
              {
                backgroundColor: LOGO_COLORS.violetGlow,
                transform: [{ scale: haloScale }],
                opacity: haloOpacity,
              },
            ]}
          />

          {/* Layer 2: Secondary golden amber ambient aura */}
          <Animated.View
            style={[
              styles.goldAura,
              {
                backgroundColor: LOGO_COLORS.goldGlow,
                transform: [{ scale: goldHaloScale }],
                opacity: goldHaloOpacity,
              },
            ]}
          />

          {/* Layer 3: Rotating decorative orbital ring */}
          <Animated.View
            style={[
              styles.orbitalRing,
              {
                borderColor: 'rgba(178, 102, 255, 0.45)',
                transform: [{ rotate: spinDeg }],
              },
            ]}
          >
            <View style={styles.orbitDotPrimary} />
            <View style={styles.orbitDotSecondary} />
          </Animated.View>

          {/* Layer 4: Counter-rotating subtle golden accent ring */}
          <Animated.View
            style={[
              styles.innerOrbitalRing,
              {
                borderColor: 'rgba(242, 194, 0, 0.35)',
                transform: [{ rotate: reverseSpinDeg }],
              },
            ]}
          >
            <View style={styles.innerOrbitDot} />
          </Animated.View>

          {/* The Actual Prominent App Logo */}
          <View style={styles.logoCard}>
            <Image
              source={APP_LOGO_IMAGE}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* App Title & Tagline with Logo Colors */}
        <Text style={styles.title} allowFontScaling={false}>
          EiBi Games
        </Text>
        <View style={styles.taglineBadge}>
          <Text style={styles.subtitle} allowFontScaling={false}>
            SWIPE & PLAY
          </Text>
        </View>
      </Animated.View>

      {/* Loading Progress & Dynamic Experience Status */}
      <View style={styles.loadingContainer}>
        {/* Info header: progress % and live remaining seconds countdown */}
        <View style={styles.progressStatsRow}>
          <View style={styles.countdownBadge}>
            <View style={styles.livePulseDot} />
            <Text style={styles.countdownText} allowFontScaling={false}>
              {clampedProgress >= 1 ? 'Ready!' : `${remainingSeconds}s remaining`}
            </Text>
          </View>
          <Text style={styles.percentText} allowFontScaling={false}>
            {`${percentNumber}%`}
          </Text>
        </View>

        {/* High-end neon violet & gold progress bar */}
        <View style={styles.track}>
          <Animated.View style={[styles.bar, { width: barWidthPercent }]}>
            <View style={styles.barHighlight} />
            <View style={styles.barLeadingGlow} />
          </Animated.View>
        </View>

        {/* Dynamic game engine loading message */}
        <Text style={styles.statusText} allowFontScaling={false} numberOfLines={2}>
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
    backgroundColor: LOGO_COLORS.bg,
    paddingHorizontal: 32,
    paddingBottom: 52,
    zIndex: 100,
    elevation: 100,
    justifyContent: 'space-between',
  },
  ambientBackdrop: {
    position: 'absolute',
    top: '15%',
    left: '10%',
    width: '80%',
    height: '50%',
    borderRadius: 999,
    backgroundColor: LOGO_COLORS.ambient,
    opacity: 0.45,
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    position: 'relative',
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowAura: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  goldAura: {
    position: 'absolute',
    width: 135,
    height: 135,
    borderRadius: 68,
  },
  orbitalRing: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orbitDotPrimary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LOGO_COLORS.goldGlow,
    marginTop: -4,
    shadowColor: LOGO_COLORS.goldGlow,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  orbitDotSecondary: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LOGO_COLORS.violetGlow,
    marginBottom: -3,
  },
  innerOrbitalRing: {
    position: 'absolute',
    width: 146,
    height: 146,
    borderRadius: 73,
    borderWidth: 1,
    borderStyle: 'solid',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  innerOrbitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LOGO_COLORS.goldLight,
    marginLeft: -3,
  },
  logoCard: {
    width: 116,
    height: 116,
    borderRadius: 28,
    backgroundColor: LOGO_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(178, 102, 255, 0.45)',
    shadowColor: LOGO_COLORS.violetGlow,
    shadowOpacity: 0.65,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    overflow: 'hidden',
  },
  logoImage: {
    width: 112,
    height: 112,
    borderRadius: 26,
  },
  title: {
    marginTop: 26,
    color: LOGO_COLORS.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(178, 102, 255, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  taglineBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(242, 194, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(242, 194, 0, 0.35)',
  },
  subtitle: {
    color: LOGO_COLORS.goldGlow,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3,
  },
  loadingContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingBottom: 16,
  },
  progressStatsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(178, 102, 255, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(178, 102, 255, 0.28)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LOGO_COLORS.goldGlow,
    marginRight: 6,
  },
  countdownText: {
    color: LOGO_COLORS.goldLight,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  percentText: {
    color: LOGO_COLORS.violetGlow,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  track: {
    width: '100%',
    height: 10,
    backgroundColor: LOGO_COLORS.card,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LOGO_COLORS.trackBorder,
  },
  bar: {
    height: '100%',
    backgroundColor: LOGO_COLORS.violetGlow,
    borderRadius: 999,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barHighlight: {
    ...StyleSheet.absoluteFill,
    backgroundColor: LOGO_COLORS.lavenderSub,
    opacity: 0.25,
  },
  barLeadingGlow: {
    width: 8,
    height: '100%',
    backgroundColor: LOGO_COLORS.goldGlow,
    borderRadius: 4,
    shadowColor: LOGO_COLORS.goldGlow,
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  statusText: {
    marginTop: 14,
    color: LOGO_COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    minHeight: 32,
  },
});
