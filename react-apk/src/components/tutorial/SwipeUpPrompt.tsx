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

const SWIPE_CYCLE_MS = 2200;
const STROKE_WIDTH = 7;

/**
 * 28 overlapping micro-segments along a wide, tilted sweeping quadratic Bézier curve:
 * P0 = (170, 170) [bottom-right start]
 * P1 = (50, 102)  [wide left-tilted control point]
 * P2 = (82, 22)   [top finish]
 *
 * Coordinates are local to lineInnerContainer (height: 160, anchored at baseline Y = 176 in 240x260 gesture space).
 * Top of lineInnerContainer corresponds to gesture Y = 16.
 */
const CURVE_SEGMENTS: Array<{ x: number; y: number; len: number; angle: number }> = [
  { x: 165.8, y: 151.6, len: 11.7, angle: -149.7 },
  { x: 157.6, y: 146.6, len: 11.4, angle: -148.5 },
  { x: 149.8, y: 141.8, len: 11.0, angle: -147.2 },
  { x: 142.4, y: 136.8, len: 10.8, angle: -145.2 },
  { x: 135.4, y: 131.8, len: 10.4, angle: -143.7 },
  { x: 128.8, y: 126.8, len: 10.1, angle: -142.0 },
  { x: 122.6, y: 121.8, len: 9.9, angle: -140.7 },
  { x: 116.7, y: 116.8, len: 9.6, angle: -138.2 },
  { x: 111.2, y: 111.6, len: 9.4, angle: -135.0 },
  { x: 106.2, y: 106.5, len: 9.1, angle: -133.9 },
  { x: 101.5, y: 101.3, len: 8.9, angle: -130.9 },
  { x: 97.2, y: 96.1, len: 8.6, angle: -128.3 },
  { x: 93.2, y: 90.9, len: 8.4, angle: -126.2 },
  { x: 89.7, y: 85.7, len: 8.2, angle: -121.9 },
  { x: 86.6, y: 80.4, len: 8.0, angle: -118.7 },
  { x: 83.8, y: 75.1, len: 7.9, angle: -116.1 },
  { x: 81.4, y: 69.7, len: 7.8, angle: -112.2 },
  { x: 79.4, y: 64.3, len: 7.7, angle: -108.4 },
  { x: 77.8, y: 58.9, len: 7.6, angle: -104.5 },
  { x: 76.6, y: 53.5, len: 7.6, angle: -100.3 },
  { x: 75.8, y: 48.0, len: 7.4, angle: -96.3 },
  { x: 75.4, y: 42.5, len: 7.6, angle: -92.0 },
  { x: 75.4, y: 37.0, len: 7.5, angle: -89.0 },
  { x: 75.7, y: 31.4, len: 7.6, angle: -83.9 },
  { x: 76.5, y: 25.8, len: 7.7, angle: -80.9 },
  { x: 77.6, y: 20.2, len: 7.7, angle: -76.9 },
  { x: 79.1, y: 14.5, len: 7.9, angle: -73.4 },
  { x: 81.0, y: 8.9, len: 8.1, angle: -69.8 },
];

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

  // Keyframe timeline:
  // 0.00 -> 0.06: Rest at bottom-right start (170, 170)
  // 0.06 -> 0.56: Upward sweep to (82, 22), fingertip draws the wide sweeping arc progressively
  // 0.56 -> 0.66: Peak pause at top with full line visible
  // 0.66 -> 0.90: Smooth downward return along the curve to (170, 170), erasing the line progressively
  // 0.90 -> 1.00: Settle at start before next cycle seamlessly repeats (zero jumps)
  const KEYFRAME_TIMES = [
    0, 0.06, 0.123, 0.185, 0.248, 0.31, 0.373, 0.435, 0.498, 0.56, 0.66, 0.7, 0.74, 0.78, 0.82, 0.86, 0.9, 1,
  ];

  const handTranslateX = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: [
      170, 170, 168.1, 155.6, 126.1, 88, 75.3, 78.6, 81.5, 82, 82, 80.9, 75.9, 88, 137.8, 165.6, 170, 170,
    ],
  });

  const handTranslateY = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: [
      170, 170, 168.9, 161.5, 140.8, 99, 55.2, 32, 23.2, 22, 22, 25, 45.4, 99, 149.6, 167.5, 170, 170,
    ],
  });

  const handRotate = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: [
      '8deg', '8deg', '7.9deg', '7deg', '4.6deg', '0deg', '-4.6deg', '-7deg', '-7.9deg', '-8deg', '-8deg',
      '-7.7deg', '-5.6deg', '0deg', '5.6deg', '7.7deg', '8deg', '8deg',
    ],
  });

  const handOpacity = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: [
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.93, 0.87, 0.85, 0.87, 0.93, 1, 1,
    ],
  });

  // Progressive Draw & Erase:
  // Height matches 176 - Y_tip at every keyframe, locking the top of the line strictly to the fingertip.
  const lineRevealHeight = loopAnim.interpolate({
    inputRange: KEYFRAME_TIMES,
    outputRange: [
      0, 0, 7.1, 14.5, 35.2, 77, 120.8, 144, 152.8, 154, 154, 151, 130.6, 77, 26.4, 8.5, 0, 0,
    ],
  });

  const lineOpacity = loopAnim.interpolate({
    inputRange: [0, 0.05, 0.06, 0.66, 0.86, 0.90, 1],
    outputRange: [0, 0, 1, 1, 0.6, 0, 0],
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
          {/* Progressive Wide Sweeping Arc (Anchored at baseline Y = 176, reveals up to fingertip) */}
          <Animated.View
            style={[
              styles.lineRevealWrapper,
              {
                height: lineRevealHeight,
                opacity: lineOpacity,
              },
            ]}
          >
            <View style={styles.lineInnerContainer}>
              {/* Rounded start base */}
              <View style={styles.baseCap} />

              {/* Seamless micro-segments along the sweeping curve */}
              {CURVE_SEGMENTS.map((seg, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.segment,
                    {
                      left: seg.x - seg.len / 2,
                      top: seg.y - STROKE_WIDTH / 2,
                      width: seg.len,
                      transform: [{ rotate: `${seg.angle}deg` }],
                    },
                  ]}
                />
              ))}

              {/* Rounded top cap */}
              <View style={styles.topCap} />
            </View>
          </Animated.View>

          {/* Animated Hand:
              Centered exactly at (X_tip, Y_tip) with handImage offset (-95, -7).
              The index fingertip is locked to (X_tip, Y_tip) and rotates around the fingertip. */}
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
  // Clip wrapper anchored at baseline Y = 176 (260 - 176 = 84 from bottom)
  lineRevealWrapper: {
    position: 'absolute',
    left: 0,
    bottom: 84,
    width: 240,
    overflow: 'hidden',
  },
  lineInnerContainer: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 240,
    height: 160,
  },
  baseCap: {
    position: 'absolute',
    left: 170 - STROKE_WIDTH / 2,
    top: 154 - STROKE_WIDTH / 2,
    width: STROKE_WIDTH,
    height: STROKE_WIDTH,
    borderRadius: STROKE_WIDTH / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  topCap: {
    position: 'absolute',
    left: 82 - STROKE_WIDTH / 2,
    top: 6 - STROKE_WIDTH / 2,
    width: STROKE_WIDTH,
    height: STROKE_WIDTH,
    borderRadius: STROKE_WIDTH / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  segment: {
    position: 'absolute',
    height: STROKE_WIDTH,
    borderRadius: STROKE_WIDTH / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
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
  // 148x136 hand image offset so that fingertip (x=96, y=8) aligns with the tracker center (1, 1)
  handImage: {
    position: 'absolute',
    left: -95,
    top: -7,
    width: 148,
    height: 136,
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
