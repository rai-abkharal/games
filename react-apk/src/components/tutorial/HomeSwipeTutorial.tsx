import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SwipeGesture, SWIPE_CYCLE_MS } from './SwipeUpPrompt';

interface Props {
  visible: boolean;
  gestureProgress: Animated.Value;
  revealProgress: Animated.Value;
  onDismiss: () => void;
}

const DISPLAY_MS = SWIPE_CYCLE_MS * 3;

/** Non-blocking coach content that sits in the space revealed below the game. */
export const HomeSwipeTutorial = memo(function HomeSwipeTutorialInner({
  visible,
  gestureProgress,
  revealProgress,
  onDismiss,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      gestureProgress.stopAnimation();
      gestureProgress.setValue(0);
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 170,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(revealProgress, {
          toValue: 0,
          duration: 360,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => finished && setMounted(false));
      return;
    }

    setMounted(true);
    contentOpacity.setValue(0);
    revealProgress.setValue(0);
    gestureProgress.setValue(0);
    Animated.parallel([
      Animated.timing(revealProgress, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 320,
        delay: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    const cycle = Animated.loop(
      Animated.timing(gestureProgress, {
        toValue: 1,
        duration: SWIPE_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    cycle.start();
    const timer = setTimeout(onDismiss, DISPLAY_MS);
    return () => {
      clearTimeout(timer);
      cycle.stop();
      gestureProgress.setValue(0);
    };
  }, [visible, contentOpacity, gestureProgress, onDismiss, revealProgress]);

  if (!mounted) return null;

  return (
    <View
      style={styles.root}
      pointerEvents="none"
      accessibilityLabel="Home swipe tutorial"
    >
      <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
        <View style={styles.copy}>
          <Text style={styles.title}>Swipe up for the next game</Text>
        </View>
        <SwipeGesture progress={gestureProgress} compact />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '13%',
    zIndex: 998,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  copy: { flexShrink: 1, marginRight: -10 },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
