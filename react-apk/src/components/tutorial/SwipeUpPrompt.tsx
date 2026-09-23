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

import { PALM, TIP, SWIPE_TIMES, SWIPE_POSES, swipePose } from './swipeMotion';

const SWIPE_HAND_IMAGE = require('../../assets/images/tiktok_swipe_hand.png');

// A single circular stroke uses the unchanged palm pivot and fingertip radius.
// Reveal it with a moving clip instead of separately faded line segments.
const GUIDE_WIDTH = 5;
const GUIDE_RADIUS = Math.hypot(TIP.x - PALM.x, TIP.y - PALM.y);
const GUIDE_END = swipePose(0.43);
const GUIDE_START = swipePose(0.12);
const GUIDE_LEFT = 146 - GUIDE_RADIUS - GUIDE_WIDTH / 2;
const GUIDE_TOP = GUIDE_END.y - GUIDE_WIDTH / 2;
const GUIDE_HEIGHT = GUIDE_START.y - GUIDE_END.y + GUIDE_WIDTH;
const GUIDE_DIAMETER = GUIDE_RADIUS * 2 + GUIDE_WIDTH;

export interface SwipeUpPromptProps {
  visible: boolean;
  onSwipeUp: () => boolean | void;
  /** Lets the feed follow the demonstrated finger without changing page. */
  gestureProgress?: Animated.Value;
}

export interface SwipeGestureProps {
  progress: Animated.Value;
  compact?: boolean;
}

export const SWIPE_CYCLE_MS = 1900;

/**
 * The gesture from the supplied reference video: an outlined, left-pointing
 * hand, a contact glow at its fingertip, and a line drawn by that fingertip.
 */
export const SwipeGesture = memo(function SwipeGestureInner({
  progress,
  compact = false,
}: SwipeGestureProps) {
  const handRotate = progress.interpolate({
    inputRange: SWIPE_TIMES,
    outputRange: SWIPE_POSES.map(pose => `${pose.angle}deg`),
  });
  const touchOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.2, 0.55, 0.72, 1],
    outputRange: [0, 0, 0.8, 0.8, 0, 0],
  });
  const guideRevealY = progress.interpolate({
    inputRange: SWIPE_TIMES,
    outputRange: SWIPE_POSES.map(pose => pose.y - GUIDE_END.y),
  });
  const guideCounterY = Animated.multiply(guideRevealY, -1);
  const guideOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.2, 0.55, 0.72, 1],
    outputRange: [0, 0, 0.65, 0.65, 0, 0],
  });

  return (
    <View
      style={[
        styles.gestureContainer,
        compact && styles.gestureContainerCompact,
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.guideBounds, { opacity: guideOpacity }]}>
        <Animated.View style={[styles.guideReveal, {
          transform: [{ translateY: guideRevealY }],
        }]}>
          <Animated.View style={[styles.guideCircle, {
            transform: [{ translateY: guideCounterY }],
          }]} />
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={[styles.palmPivot, { transform: [{ rotate: handRotate }] }]}
      >
        <Animated.View
          style={[
            styles.touchCircle,
            {
              left: TIP.x - PALM.x - 12,
              top: TIP.y - PALM.y - 12,
              opacity: touchOpacity,
            },
          ]}
        />
        <Image
          source={SWIPE_HAND_IMAGE}
          style={[styles.handImage, { left: -PALM.x, top: -PALM.y }]}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
});

/** Full-screen prompt used between the two pre-game tutorial levels. */
export const SwipeUpPrompt = memo(function SwipeUpPromptInner({
  visible,
  onSwipeUp,
  gestureProgress,
}: SwipeUpPromptProps) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const internalProgress = useRef(new Animated.Value(0)).current;
  const progress = gestureProgress ?? internalProgress;
  const cycleRef = useRef<Animated.CompositeAnimation | null>(null);
  const hasTriggeredRef = useRef(false);

  const handleTrigger = useCallback(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    // A rejected transition must not consume the lesson or hide its gesture.
    if (onSwipeUp() === false) {
      hasTriggeredRef.current = false;
      return;
    }
    cycleRef.current?.stop();
    progress.setValue(0);
    setMounted(false);
  }, [onSwipeUp, progress]);
  const triggerRef = useRef(handleTrigger);
  triggerRef.current = handleTrigger;

  useEffect(() => {
    if (!visible) {
      cycleRef.current?.stop();
      progress.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => setMounted(false));
      return;
    }

    setMounted(true);
    hasTriggeredRef.current = false;
    progress.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    const cycle = Animated.loop(
      Animated.timing(progress, {
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
      progress.setValue(0);
    };
  }, [visible, fadeAnim, progress]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy < -8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        // Genuine upward swipe required (no taps/clicks)
        if (gestureState.dy < -20 || gestureState.vy < -0.25) {
          triggerRef.current();
        }
      },
    }),
  ).current;

  if (!mounted) return null;

  return (
    <Animated.View
      testID="swipe_up_prompt_overlay"
      style={[styles.overlay, { opacity: fadeAnim }]}
      accessibilityActions={[{ name: 'activate', label: 'swipeUp' }]}
      onAccessibilityAction={() => handleTrigger()}
      {...panResponder.panHandlers}
    >
      <View
        style={styles.pressableArea}
        accessibilityLabel="Swipe up for more"
      >
        <SwipeGesture progress={progress} />
        <Text style={styles.promptText}>Swipe up for more</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5, 10, 22, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  pressableArea: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gestureContainer: { width: 200, height: 142, position: 'relative' },
  gestureContainerCompact: {
    transform: [{ scale: 0.62 }],
    marginHorizontal: -35,
    marginVertical: -27,
  },
  guideBounds: {
    position: 'absolute',
    left: GUIDE_LEFT,
    top: GUIDE_TOP,
    width: GUIDE_RADIUS + GUIDE_WIDTH / 2,
    height: GUIDE_HEIGHT,
    overflow: 'hidden',
  },
  guideReveal: {
    width: GUIDE_RADIUS + GUIDE_WIDTH / 2,
    height: GUIDE_HEIGHT,
    overflow: 'hidden',
  },
  guideCircle: {
    position: 'absolute',
    left: 0,
    top: 68 - GUIDE_RADIUS - GUIDE_WIDTH / 2 - GUIDE_TOP,
    width: GUIDE_DIAMETER,
    height: GUIDE_DIAMETER,
    borderRadius: GUIDE_DIAMETER / 2,
    borderWidth: GUIDE_WIDTH,
    borderColor: '#FFFFFF',
  },
  touchCircle: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  palmPivot: { position: 'absolute', left: 146, top: 68, width: 0, height: 0 },
  handImage: { position: 'absolute', width: 120, height: 105 },
  promptText: {
    marginTop: 8,
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
