import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

const APP_LOGO_IMAGE = require('../../assets/images/app_logo.png');

interface Props {
  /** Optional title to show below the loader (e.g. game name when swiping). If omitted, displays "Loading". */
  title?: string;
  /** Optional category or secondary status caption below title. */
  subtitle?: string;
  /** Logo image size in dp (default: 84). */
  logoSize?: number;
  /** Background canvas color override. */
  backgroundColor?: string;
}

export function CircularLogoLoader({
  title,
  subtitle,
  logoSize = 84,
  backgroundColor = 'transparent',
}: Props) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if ((globalThis as any).process?.env?.NODE_ENV === 'test') {
      return;
    }

    const spin = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    spin.start();
    pulse.start();

    return () => {
      spin.stop();
      pulse.stop();
    };
  }, [rotateAnim, pulseAnim]);

  const spinDeg = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const reverseSpinDeg = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const haloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.18],
  });

  const haloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  const goldHaloScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.14],
  });

  const goldHaloOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.55],
  });

  const ringSize = logoSize + 46;
  const innerRingSize = logoSize + 28;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Circular Animated Rings & Glowing Halo around Logo */}
      <View style={[styles.loaderWrapper, { width: ringSize + 16, height: ringSize + 16 }]}>
        {/* Layer 1: Ambient lavender pulsing aura */}
        <Animated.View
          style={[
            styles.glowAura,
            {
              width: ringSize + 20,
              height: ringSize + 20,
              borderRadius: (ringSize + 20) / 2,
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
              width: ringSize + 8,
              height: ringSize + 8,
              borderRadius: (ringSize + 8) / 2,
              transform: [{ scale: goldHaloScale }],
              opacity: goldHaloOpacity,
            },
          ]}
        />

        {/* Layer 3: Rotating decorative orbital ring with dots */}
        <Animated.View
          style={[
            styles.orbitalRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: 'rgba(178, 102, 255, 0.45)',
              transform: [{ rotate: spinDeg }],
            },
          ]}
        >
          <View style={styles.orbitDotPrimary} />
          <View style={styles.orbitDotSecondary} />
        </Animated.View>

        {/* Layer 4: Counter-rotating golden accent ring */}
        <Animated.View
          style={[
            styles.innerOrbitalRing,
            {
              width: innerRingSize,
              height: innerRingSize,
              borderRadius: innerRingSize / 2,
              borderColor: 'rgba(242, 194, 0, 0.35)',
              transform: [{ rotate: reverseSpinDeg }],
            },
          ]}
        >
          <View style={styles.innerOrbitDot} />
        </Animated.View>

        {/* Centered App Logo inside Circular Orbitals */}
        <Image
          source={APP_LOGO_IMAGE}
          style={{
            width: logoSize,
            height: logoSize,
            borderRadius: 22,
            shadowColor: '#8B5CF6',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
          resizeMode="contain"
        />
      </View>

      {/* Under the logo: show game title when swiping, or only "Loading" */}
      <View style={styles.captionContainer}>
        {title ? (
          <>
            <Text style={styles.gameTitle} numberOfLines={2} allowFontScaling={false}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.gameSubtitle} numberOfLines={1} allowFontScaling={false}>
                {subtitle}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.loadingText} allowFontScaling={false}>
            Loading
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loaderWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowAura: {
    position: 'absolute',
    backgroundColor: 'rgba(139, 92, 246, 0.22)',
  },
  goldAura: {
    position: 'absolute',
    backgroundColor: 'rgba(250, 204, 21, 0.28)',
  },
  orbitalRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orbitDotPrimary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FACC15',
    marginTop: -4,
    shadowColor: '#FACC15',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  orbitDotSecondary: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8B5CF6',
    marginBottom: -3,
  },
  innerOrbitalRing: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'solid',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  innerOrbitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FACC15',
    marginLeft: -3,
  },
  captionContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8B5CF6',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  gameTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E1035',
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingHorizontal: 20,
  },
  gameSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#6D5D8A',
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
