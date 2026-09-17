import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SWIPE_HAND_IMAGE = require('../../assets/images/swipe_hand.png');

export interface SwipeUpPromptProps {
  visible: boolean;
  onSwipeUp: () => void;
}

const SWIPE_CYCLE_MS = 1700;

export const SwipeUpPrompt = memo(function SwipeUpPrompt({
  visible,
  onSwipeUp,
}: SwipeUpPromptProps) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loopAnim = useRef(new Animated.Value(0)).current;
  const hasTriggeredRef = useRef(false);

  const handleTrigger = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      onSwipeUp();
    });
  }, [fadeAnim, onSwipeUp]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      hasTriggeredRef.current = false;
      loopAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      const cycle = Animated.loop(
        Animated.timing(loopAnim, {
          toValue: 1,
          duration: SWIPE_CYCLE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      cycle.start();

      return () => {
        cycle.stop();
      };
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
      });
    }
  }, [visible, fadeAnim, loopAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10 || Math.abs(gestureState.dx) > 10;
      },
      onPanResponderRelease: (_, gestureState) => {
        // Swiping up or tapping
        if (gestureState.dy < -20 || gestureState.vy < -0.3 || (Math.abs(gestureState.dy) < 15 && Math.abs(gestureState.dx) < 15)) {
          handleTrigger();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  // Hand translates upward along the vertical pill trail
  const handTranslateY = loopAnim.interpolate({
    inputRange: [0, 0.12, 0.65, 0.85, 1],
    outputRange: [24, 24, -28, -28, 24],
  });

  const handOpacity = loopAnim.interpolate({
    inputRange: [0, 0.1, 0.6, 0.78, 0.88, 1],
    outputRange: [0.3, 1, 1, 0.15, 0, 0.3],
  });

  return (
    <Animated.View
      style={[styles.overlay, { opacity: fadeAnim }]}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={styles.pressableArea}
        onPress={handleTrigger}
        accessibilityRole="button"
        accessibilityLabel="Swipe up for more"
      >
        <View style={styles.gestureContainer}>
          {/* Vertical translucent pill trail */}
          <View style={styles.trackPill} />

          {/* Animated Hand Gesture */}
          <Animated.View
            style={[
              styles.handWrapper,
              {
                transform: [{ translateY: handTranslateY }],
                opacity: handOpacity,
              },
            ]}
          >
            <Image
              source={SWIPE_HAND_IMAGE}
              style={styles.handImage}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* Text exactly matching reference */}
        <Text style={styles.promptText}>Swipe up for more</Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  pressableArea: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  gestureContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  trackPill: {
    position: 'absolute',
    left: 20,
    top: 24,
    width: 48,
    height: 94,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
  },
  handWrapper: {
    position: 'absolute',
    left: 14,
    top: 30,
    width: 100,
    height: 85,
  },
  handImage: {
    width: 100,
    height: 85,
  },
  promptText: {
    marginTop: 22,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 6,
  },
});
