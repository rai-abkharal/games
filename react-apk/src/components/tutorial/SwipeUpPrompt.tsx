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

// swipe_hand.png ships rotated 90° (finger pointing left); swipe_hand_up.png
// is the same art turned upright so the index finger actually points up.
const SWIPE_HAND_IMAGE = require('../../assets/images/swipe_hand_up.png');

export interface SwipeUpPromptProps {
  visible: boolean;
  onSwipeUp: () => void;
}

const SWIPE_CYCLE_MS = 2200;

/**
 * The hand's fingertip rides a quadratic Bézier in 240x260 gesture-container
 * space — a wide, natural swipe-up sweep:
 * P0 = (170, 170) [bottom-right start]
 * P1 = (50, 102)  [wide left-tilted control point]
 * P2 = (82, 22)   [top finish]
 */
const P0 = { x: 170, y: 170 };
const P1 = { x: 50, y: 102 };
const P2 = { x: 82, y: 22 };

function curvePoint(t: number): { x: number; y: number } {
  const a = (1 - t) * (1 - t);
  const b = 2 * t * (1 - t);
  const c = t * t;
  return {
    x: a * P0.x + b * P1.x + c * P2.x,
    y: a * P0.y + b * P1.y + c * P2.y,
  };
}

/**
 * Keyframe timeline (fractions of the loop):
 * 0.00 -> 0.06: rest at P0
 * 0.06 -> 0.56: ease-in-out sweep up the curve
 * 0.56 -> 0.66: peak pause at P2
 * 0.66 -> 0.90: ease-in-out return down the curve
 * 0.90 -> 1.00: settle at P0 so the cycle loops seamlessly
 *
 * Sampled uniformly in the CURVE parameter (time solved via the easing
 * inverse), so the hand never straight-lines across a bend.
 */
const SWEEP_START = 0.06;
const SWEEP_END = 0.56;
const HOLD_END = 0.66;
const RETURN_END = 0.9;
const UP_STEPS = 28;
const DOWN_STEPS = 16;

/** Inverse of easeInOutCubic: time fraction that reaches curve progress t. */
const easeInOutCubicInv = (t: number) =>
  t < 0.5 ? Math.cbrt(t / 4) : 1 - Math.cbrt((1 - t) / 4);

const KEYFRAMES: Array<{ time: number; t: number }> = (() => {
  const frames: Array<{ time: number; t: number }> = [{ time: 0, t: 0 }];
  for (let i = 0; i <= UP_STEPS; i++) {
    const t = i / UP_STEPS;
    frames.push({ time: SWEEP_START + (SWEEP_END - SWEEP_START) * easeInOutCubicInv(t), t });
  }
  frames.push({ time: HOLD_END, t: 1 });
  for (let i = 1; i <= DOWN_STEPS; i++) {
    const t = 1 - i / DOWN_STEPS;
    frames.push({ time: HOLD_END + (RETURN_END - HOLD_END) * easeInOutCubicInv(i / DOWN_STEPS), t });
  }
  frames.push({ time: 1, t: 0 });
  return frames;
})();

const KEYFRAME_TIMES = KEYFRAMES.map(k => k.time);
const KEYFRAME_POINTS = KEYFRAMES.map(k => curvePoint(k.t));
const HAND_X_FRAMES = KEYFRAME_POINTS.map(p => p.x);
const HAND_Y_FRAMES = KEYFRAME_POINTS.map(p => p.y);
/** Subtle wrist tilt, linear in curve progress; pivots on the fingertip. */
const HAND_ROTATE_FRAMES = KEYFRAMES.map(k => `${8 - 16 * k.t}deg`);

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

  // Keyframes sampled from the Bézier at module load.
  const handTranslateX = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: HAND_X_FRAMES,
  });

  const handTranslateY = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: HAND_Y_FRAMES,
  });

  const handRotate = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: HAND_ROTATE_FRAMES,
  });

  const handOpacity = loopAnim.interpolate({
    inputRange: [0, HOLD_END, 0.78, RETURN_END, 1],
    outputRange: [1, 1, 0.85, 1, 1],
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
          {/* Animated Hand: the 2x2 tracker's center rides the Bézier, the image
              is offset so the index fingertip sits exactly on that center, and
              rotation pivots on it. */}
          <Animated.View
            style={[
              styles.handTracker,
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
    // Darkened screen for clear focus on the hand and gesture area
    backgroundColor: 'rgba(5, 10, 22, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  pressableArea: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gestureContainer: {
    width: 240,
    height: 260,
    position: 'relative',
    overflow: 'visible',
  },
  // Hand tracker anchored at fingertip: 2x2 view centered at (0, 0)
  handTracker: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 2,
    height: 2,
    marginLeft: -1,
    marginTop: -1,
  },
  // swipe_hand_up.png is 120x130 with the index fingertip at pixel (45.5, 6).
  // Rendered at exact 1.1x aspect (132x143, no "contain" letterbox), the tip
  // lands at (50.05, 6.6); offset it onto the tracker center (1, 1) so the
  // fingertip IS the transform origin.
  handImage: {
    position: 'absolute',
    left: -49.05,
    top: -5.6,
    width: 132,
    height: 143,
  },
  promptText: {
    marginTop: 28,
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
