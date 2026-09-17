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
  | 'water_sort_playing'
  | 'water_sort_completed'
  | 'done';

export interface PreGameTutorialProps {
  visible: boolean;
  step?: TutorialFlowStep;
  onSwipeUp?: () => void;
  onComplete: () => void;
  onSkip?: () => void;
}

/**
 * Minimal, clean first-time tutorial flow:
 *  1. Arrow Puzzle (Level 1) - user plays normally.
 *  2. "Swipe up for more" hand gesture prompt matching reference image.
 *  3. Water Sort (Level 1) - user plays normally.
 *  4. Clean "Let's Play" button to enter the main Games page.
 *
 * No extra colors, decorations, or joystick tutorials.
 */
export const PreGameTutorial = memo(function PreGameTutorialInner({
  visible,
  step = 'arrow_playing',
  onSwipeUp,
  onComplete,
  onSkip,
}: PreGameTutorialProps) {
  const [internalStep, setInternalStep] = useState<TutorialFlowStep>(step);
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Sync internal step when controlled step changes
  useEffect(() => {
    setInternalStep(step);
  }, [step]);

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

  const handleSkip = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      onSkip ? onSkip() : onComplete();
    });
  }, [fadeAnim, onSkip, onComplete]);

  const handleSwipeUp = useCallback(() => {
    if (onSwipeUp) {
      onSwipeUp();
    } else {
      setInternalStep('water_sort_playing');
    }
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

  // State 1: Arrow Puzzle Completed -> Show Swipe Up Hand Gesture
  if (internalStep === 'arrow_completed') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <SwipeUpPrompt visible={true} onSwipeUp={handleSwipeUp} />
        {onSkip ? (
          <Pressable
            style={styles.skipButton}
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // State 2: Water Sort Completed -> Show minimal "Let's Play" button
  if (internalStep === 'water_sort_completed') {
    return (
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <View style={styles.completionContainer}>
          <Text style={styles.completionTitle}>Great Job!</Text>
          <Text style={styles.completionSubtitle}>Ready to explore all games?</Text>
          <Pressable
            style={({ pressed }) => [
              styles.letsPlayButton,
              pressed && styles.letsPlayButtonPressed,
            ]}
            onPress={handleFinish}
            accessibilityRole="button"
            accessibilityLabel="Let's Play"
          >
            <Text style={styles.letsPlayText}>Let's Play</Text>
          </Pressable>
        </View>
        {onSkip ? (
          <Pressable
            style={styles.skipButton}
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  // When playing (arrow_playing or water_sort_playing): minimal top skip pill if needed
  return onSkip ? (
    <View style={styles.minimalOverlay} pointerEvents="box-none">
      <Pressable
        style={styles.skipButton}
        onPress={handleSkip}
        accessibilityRole="button"
        accessibilityLabel="Skip tutorial"
      >
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  ) : null;
});

const styles = StyleSheet.create({
  minimalOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },
  skipButton: {
    position: 'absolute',
    top: 16,
    right: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    zIndex: 1000,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  completionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  completionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  completionSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  letsPlayButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 42,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  letsPlayButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  letsPlayText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
