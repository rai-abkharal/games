import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const APP_LOGO_IMAGE = require('../assets/images/app_logo.png');

interface Props {
  /** How long the splash stays before fading (default: 30000 ms). */
  minimumMs?: number;
  ready?: boolean;
  onDone: () => void;
  /** Normalized progress from 0.0 to 1.0. */
  progress?: number;
  /** Optional custom status caption. */
  statusText?: string;
  /** Total preload seconds. */
  totalSeconds?: number;
}

const LOGO_COLORS = {
  bg: '#F4EFFD',
  violetGlow: 'rgba(139, 92, 246, 0.22)',
  goldGlow: 'rgba(250, 204, 21, 0.28)',
  goldLight: '#F59E0B',
  goldOrb: '#FDE047',
  violetAccent: '#8B5CF6',
  textPrimary: '#1A0B36',
  percentColor: '#8B5CF6',
};

export function Splash({
  minimumMs = 30000,
  ready = false,
  onDone,
  progress = 0,
}: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(progress > 0 ? progress : 0)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const fading = useRef(false);

  const [percent, setPercent] = useState(() => Math.round((progress || 0) * 100));

  const reveal = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    setPercent(100);
    Animated.timing(fade, {
      toValue: 0,
      duration: 260,
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
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => enter.stopAnimation();
  }, [enter]);

  // Continuous pulsating glow and rotating orbital rings around logo
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
        duration: 7000,
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

  // Sync listener on progressAnim to update numeric percent state
  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      setPercent(Math.min(100, Math.max(0, Math.round(value * 100))));
    });
    return () => {
      progressAnim.removeListener(listenerId);
    };
  }, [progressAnim]);

  // If props.progress is explicitly provided and updated externally
  useEffect(() => {
    if (progress !== undefined && progress > 0) {
      setPercent(Math.min(100, Math.max(0, Math.round(progress * 100))));
      Animated.timing(progressAnim, {
        toValue: Math.max(0, Math.min(1, progress)),
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [progress, progressAnim]);

  // Realistic non-linear 30-second progress animation (starts, pauses/stalls, aggressively surges)
  useEffect(() => {
    if ((globalThis as any).process?.env?.NODE_ENV === 'test') {
      return;
    }

    const sequence = Animated.sequence([
      // 0% -> 22% in 3.5s (Smooth startup)
      Animated.timing(progressAnim, {
        toValue: 0.22,
        duration: 3500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      // 22% -> 34% in 3.5s (Steady game asset loading)
      Animated.timing(progressAnim, {
        toValue: 0.34,
        duration: 3500,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      // 34% -> 39% in 3.0s (STALL: brief hold / slow crawl)
      Animated.timing(progressAnim, {
        toValue: 0.39,
        duration: 3000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
      // 39% -> 66% in 3.5s (AGGRESSIVE SURGE!)
      Animated.timing(progressAnim, {
        toValue: 0.66,
        duration: 3500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      // 66% -> 74% in 3.5s (Steady asset verification)
      Animated.timing(progressAnim, {
        toValue: 0.74,
        duration: 3500,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
      // 74% -> 78% in 3.5s (STALL: brief hold around 78%, exact to screenshot!)
      Animated.timing(progressAnim, {
        toValue: 0.78,
        duration: 3500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
      // 78% -> 93% in 4.5s (AGGRESSIVE SURGE!)
      Animated.timing(progressAnim, {
        toValue: 0.93,
        duration: 4500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      // 93% -> 98% in 3.0s (Finalizing environment)
      Animated.timing(progressAnim, {
        toValue: 0.98,
        duration: 3000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      // 98% -> 100% in 2.0s (Ready!)
      Animated.timing(progressAnim, {
        toValue: 1.0,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]);

    sequence.start();
    return () => sequence.stop();
  }, [progressAnim]);

  // Minimum duration fallback (30s preloading)
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
    outputRange: [24, 0],
  });

  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.18],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  const spinDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const barWidthPercent = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="none">
      {/* 1. Top-Left Decorative Corner Arcs & Orb */}
      <View style={styles.topLeftArcOuter} />
      <View style={styles.topLeftArcInner} />
      <View style={styles.topLeftOrb} />

      {/* 2. Bottom-Right Decorative Corner Arcs & Orb */}
      <View style={styles.bottomRightArcOuter} />
      <View style={styles.bottomRightArcInner} />
      <View style={styles.bottomRightOrb} />

      {/* 3. Soft Background Bokeh Glows & Twinkle Sparkles */}
      <View style={styles.bokehTopRight} />
      <View style={styles.bokehBottomLeft} />
      <View style={styles.sparkle1} />
      <View style={styles.sparkle2} />
      <View style={styles.sparkle3} />

      {/* Main Content Layout */}
      <Animated.View
        style={[
          styles.contentWrapper,
          { opacity: enter, transform: [{ translateY }] },
        ]}
      >
        {/* Center: Brand name placed almost directly above the compact logo */}
        <View style={styles.centerContainer}>
          <View style={styles.brandSection}>
            <Text
              style={styles.title}
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              EiBi Games
            </Text>
            <Text style={styles.subtitle} allowFontScaling={false}>
              SWIPE & PLAY
            </Text>
          </View>

          <View style={styles.logoSection}>
            <View style={styles.logoWrapper}>
              {/* Outer Solid Glowing White Ring */}
              <View style={styles.outerSolidRing}>
                <View style={styles.outerGoldOrb} />
                <View style={styles.sparkleFlare} />
              </View>

              {/* Middle Rotating Dashed Ring with Purple & Gold Dots */}
              <Animated.View style={[styles.middleDashedRing, { transform: [{ rotate: spinDeg }] }]}>
                <View style={styles.dashedPurpleDot} />
                <View style={styles.dashedGoldDot} />
              </Animated.View>

              {/* Inner Ambient Luminous Pulsing Glow */}
              <Animated.View
                style={[
                  styles.innerHalo,
                  {
                    transform: [{ scale: haloScale }],
                    opacity: haloOpacity,
                  },
                ]}
              />

              {/* Centered App Logo (Decreased Size: 86x86) */}
              <Image
                source={APP_LOGO_IMAGE}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        {/* Bottom: Loading bar at the bottom with increased height and glowing light capsule tip */}
        <View style={styles.bottomSection}>
          <View style={styles.progressBarTrack}>
            <Animated.View style={[styles.progressBarFill, { width: barWidthPercent }]}>
              {/* Specular White Top Gloss */}
              <View style={styles.progressBarGloss} />
              {/* Leading subtle amber glow overlay */}
              <View style={styles.progressBarAmberGlow} />
              {/* Radiant Light Capsule / Glass Lens Tip */}
              <View style={styles.progressBarGlowTip}>
                <View style={styles.glowingTipCore} />
              </View>
            </Animated.View>
          </View>

          {/* Numeric Percentage Text (e.g. 78%) */}
          <Text style={styles.percentText} allowFontScaling={false}>
            {`${percent}%`}
          </Text>
        </View>
      </Animated.View>
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
    zIndex: 100,
    elevation: 100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Main vertical content layout
  contentWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 58,
  },

  // Center Container: Groups brand name and logo together
  centerContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
  },

  // Brand Section (Positioned closely almost right above the logo)
  brandSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    color: LOGO_COLORS.textPrimary,
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    color: LOGO_COLORS.goldLight,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },

  // Center: Compact Logo Section with scaled-down circular orbital rings
  logoSection: {
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
  outerSolidRing: {
    position: 'absolute',
    width: 162,
    height: 162,
    borderRadius: 81,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.88)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.85,
    shadowRadius: 8,
  },
  outerGoldOrb: {
    position: 'absolute',
    right: -5,
    top: 75,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: LOGO_COLORS.goldOrb,
    shadowColor: '#FACC15',
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  sparkleFlare: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  middleDashedRing: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(192, 132, 252, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedPurpleDot: {
    position: 'absolute',
    top: -5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  dashedGoldDot: {
    position: 'absolute',
    bottom: 18,
    left: 18,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: LOGO_COLORS.goldOrb,
    shadowColor: '#FACC15',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  innerHalo: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(255, 255, 255, 0.50)',
    shadowColor: '#C084FC',
    shadowOpacity: 0.4,
    shadowRadius: 14,
  },
  logoImage: {
    width: 86,
    height: 86,
    borderRadius: 20,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },

  // Bottom Section (Loading bar placed cleanly in the bottom)
  bottomSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  progressBarTrack: {
    width: 275,
    maxWidth: '78%',
    height: 23,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.70)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    padding: 2.5,
    overflow: 'hidden',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    overflow: 'hidden',
    position: 'relative',
    minWidth: 18,
  },
  progressBarGloss: {
    position: 'absolute',
    top: 1.5,
    left: 4,
    right: 4,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
  },
  progressBarAmberGlow: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.30)',
  },
  progressBarGlowTip: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 22,
    borderRadius: 999,
    backgroundColor: '#FDE047',
    borderWidth: 1,
    borderColor: '#FEF08A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowingTipCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    opacity: 0.9,
  },
  percentText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: LOGO_COLORS.percentColor,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Corner Arcs & Ambient Accents (Preserved)
  topLeftArcOuter: {
    position: 'absolute',
    top: -70,
    left: -70,
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  topLeftArcInner: {
    position: 'absolute',
    top: -30,
    left: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
  },
  topLeftOrb: {
    position: 'absolute',
    top: 92,
    left: 88,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: LOGO_COLORS.goldOrb,
    shadowColor: '#FACC15',
    shadowOpacity: 0.95,
    shadowRadius: 6,
    elevation: 4,
  },
  bottomRightArcOuter: {
    position: 'absolute',
    bottom: -90,
    right: -90,
    width: 290,
    height: 290,
    borderRadius: 145,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  bottomRightArcInner: {
    position: 'absolute',
    bottom: -50,
    right: -50,
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.50)',
  },
  bottomRightOrb: {
    position: 'absolute',
    bottom: 108,
    right: 98,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: LOGO_COLORS.goldOrb,
    shadowColor: '#FACC15',
    shadowOpacity: 0.95,
    shadowRadius: 6,
    elevation: 4,
  },
  bokehTopRight: {
    position: 'absolute',
    top: 140,
    right: 25,
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
  },
  bokehBottomLeft: {
    position: 'absolute',
    bottom: 130,
    left: 20,
    width: 95,
    height: 95,
    borderRadius: 47.5,
    backgroundColor: 'rgba(168, 85, 247, 0.20)',
  },
  sparkle1: {
    position: 'absolute',
    top: 240,
    left: 55,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  sparkle2: {
    position: 'absolute',
    top: 450,
    right: 48,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  sparkle3: {
    position: 'absolute',
    top: 430,
    left: 45,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
});
