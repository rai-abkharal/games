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

const SWIPE_CYCLE_MS = 1800;

export const SwipeUpPrompt = memo(function SwipeUpPrompt({
  visible,
  onSwipeUp,
}: SwipeUpPromptProps) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const loopAnim = useRef(new Animated.Value(0)).current;
  const cycleRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasTriggeredRef = useRef(false);

  const handleTrigger = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    cycleRef.current?.stop();
    setMounted(false);
    onSwipeUp();
  }, [onSwipeUp]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      hasTriggeredRef.current = false;
      loopAnim.setValue(0);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      const cycle = Animated.loop(
        Animated.timing(loopAnim, {
          toValue: 1,
          duration: SWIPE_CYCLE_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      );
      cycleRef.current = cycle;
      cycle.start();

      return () => {
        cycle.stop();
        cycleRef.current = null;
      };
    } else {
      cycleRef.current?.stop();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
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
        if (
          gestureState.dy < -18 ||
          gestureState.vy < -0.25 ||
          (Math.abs(gestureState.dy) < 15 && Math.abs(gestureState.dx) < 15)
        ) {
          handleTrigger();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  // Flatter, subtle crescent/arc motion curving to the LEFT (opposite to before):
  // Starts at bottom (Y = 46, X = 10), curves gently leftward to apex (Y = 0, X = -8),
  // and reaches top (Y = -46, X = 10).
  const handTranslateX = loopAnim.interpolate({
    inputRange: [0, 0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.88, 1],
    outputRange: [10, 10, 2, -6, -8, -6, 2, 10, 10],
  });

  const handTranslateY = loopAnim.interpolate({
    inputRange: [0, 0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.88, 1],
    outputRange: [46, 46, 32, 14, -6, -26, -46, -46, 46],
  });

  const handRotate = loopAnim.interpolate({
    inputRange: [0, 0.08, 0.36, 0.50, 0.78, 0.88, 1],
    outputRange: ['6deg', '6deg', '2deg', '0deg', '-6deg', '-6deg', '6deg'],
  });

  const handOpacity = loopAnim.interpolate({
    inputRange: [0, 0.08, 0.68, 0.80, 0.90, 1],
    outputRange: [0.3, 1, 1, 0.2, 0, 0.3],
  });

  // Progressive Draw & Erase of the curved line:
  // Draws upward from bottom to top (height 0 -> 104) as hand moves up (0.08 -> 0.78),
  // then erases progressively downward (height 104 -> 0) as hand resets (0.78 -> 0.96).
  const lineRevealHeight = loopAnim.interpolate({
    inputRange: [0, 0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.88, 0.96, 1],
    outputRange: [0, 0, 24, 48, 72, 92, 104, 104, 0, 0],
  });

  const lineOpacity = loopAnim.interpolate({
    inputRange: [0, 0.07, 0.08, 0.78, 0.88, 0.96, 1],
    outputRange: [0, 0, 1, 1, 1, 0, 0],
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
          {/* Progressive Curved Line: Anchored to the bottom, reveals upward as height increases */}
          <Animated.View
            style={[
              styles.lineRevealWrapper,
              {
                height: lineRevealHeight,
                opacity: lineOpacity,
              },
            ]}
          >
            <View style={styles.curvedLine}>
              <View style={styles.capTop} />
              <View style={styles.capBottom} />
            </View>
          </Animated.View>

          {/* Animated Hand (Moved slightly to the right, opposite flatter curve, no blue glow) */}
          <Animated.View
            style={[
              styles.handWrapper,
              {
                transform: [
                  { translateX: handTranslateX },
                  { translateY: handTranslateY },
                  { rotate: handRotate },
                ],
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

        {/* Prompt label */}
        <Text style={styles.promptText}>Swipe up for more</Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    // Dim the screen so the hand and action area are the clear focus
    backgroundColor: 'rgba(5, 10, 22, 0.75)',
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
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  // Mask/clip container anchored to the bottom of the gesture area:
  // Expands upward in height to progressively draw the line, shrinks to erase
  lineRevealWrapper: {
    position: 'absolute',
    left: 80,
    bottom: 58,
    width: 44,
    overflow: 'hidden',
  },
  // Subtle, flatter left-curved line
  curvedLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 40,
    height: 104,
    borderTopLeftRadius: 36,
    borderBottomLeftRadius: 36,
    borderLeftWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.38)',
  },
  capTop: {
    position: 'absolute',
    left: 14,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  capBottom: {
    position: 'absolute',
    left: 14,
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  // Hand wrapper shifted slightly to the right (left: 46), keeping size 148x136
  handWrapper: {
    position: 'absolute',
    left: 46,
    top: 36,
    width: 148,
    height: 136,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handImage: {
    width: 148,
    height: 136,
  },
  promptText: {
    marginTop: 22,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
