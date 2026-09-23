import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SwipeUpPrompt } from './SwipeUpPrompt';

export type TutorialFlowStep =
  | 'arrow_playing'
  | 'arrow_completed'
  | 'knife_hit_playing'
  | 'knife_hit_completed'
  | 'water_sort_playing'
  | 'water_sort_completed'
  | 'done';

export interface PreGameTutorialProps {
  visible: boolean;
  step?: TutorialFlowStep;
  onSwipeUp?: () => boolean | void;
  onComplete: () => void;
  gestureProgress?: Animated.Value;
}

/**
 * Minimal, clean first-time tutorial flow:
 *  1. Arrow Puzzle (Level 1) - user plays normally.
 *  2. "Swipe up for more" hand gesture prompt.
 *  3. Water Sort (Level 1) - user plays and finishes normally.
 *  4. Prominent "Let's Start" button to enter the main Games feed from game #1.
 */
export const PreGameTutorial = memo(function PreGameTutorialInner({
  visible,
  step = 'arrow_playing',
  onSwipeUp,
  onComplete,
  gestureProgress,
}: PreGameTutorialProps) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
  }, [visible, fadeAnim]);

  const handleSwipeUp = useCallback(() => {
    return onSwipeUp ? onSwipeUp() : false;
  }, [onSwipeUp]);

  const handleFinish = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      onComplete();
    });
  }, [fadeAnim, onComplete]);

  if (!mounted || !visible) return null;

  // State 1 & 2: Level Completed -> Show Swipe Up Hand Gesture
  if (step === 'arrow_completed' || step === 'knife_hit_completed') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <SwipeUpPrompt
          visible={true}
          onSwipeUp={handleSwipeUp}
          gestureProgress={gestureProgress}
        />
      </View>
    );
  }

  // State 2: Water Sort Completed -> Show prominent "Let's Start" button with dimmed background
  if (step === 'water_sort_completed') {
    return (
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <View style={styles.completionContainer}>
          <Text style={styles.completionTitle}>Great Job!</Text>
          <Text style={styles.completionSubtitle}>
            Ready to explore all games?
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.letsStartButton,
              pressed && styles.letsStartButtonPressed,
            ]}
            onPress={handleFinish}
            accessibilityRole="button"
            accessibilityLabel="Let's Start"
          >
            <Text style={styles.letsStartText}>Let's Start</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // When playing (arrow_playing or water_sort_playing): absolutely no overlay, fully interactive
  return null;
});

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    // Heavily dimmed background so the button/dialog is the clear focus
    backgroundColor: 'rgba(3, 7, 18, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  completionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  completionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  completionSubtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  // Prominent, premium "Let's Start" button
  letsStartButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 32,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  letsStartButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  letsStartText: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
