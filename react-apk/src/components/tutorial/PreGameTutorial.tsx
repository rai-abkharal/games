import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HAND_TIP, TutorialHand } from './TutorialHand';

export interface PreGameTutorialProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Palette lifted straight from the live product:
 *  - deep navy stage = the app's game surface (#070D1E) + the game's own
 *    arena-border navy (#14314E), so the tutorial reads as the game's world
 *    at night rather than a generic onboarding screen;
 *  - every accent (sky, cream board, snake greens, berry red, gold, teal,
 *    pink) is the exact colour Cute Snake renders with.
 */
const THEME = {
  // Dark atmospheric stage (app game surface + arena navy)
  bgDeep: '#070D1E',
  bgNavy: '#0C1930',
  navy: '#14314E',
  navyLight: '#1E4268',
  // Game world colours
  skyBlue: '#00AFF5',
  skyDeep: '#0090D6',
  boardLight: '#FFE6AD',
  boardDark: '#FDDE9E',
  snakeGreen: '#40AC46',
  snakeLime: '#83CC43',
  snakeOutline: '#358A3A',
  foodRed: '#FF5243',
  foodDark: '#9C2219',
  foodStem: '#60CE28',
  // HUD accents from the game & app glass
  white: '#FFFFFF',
  gold: '#FFD21F',
  teal: '#1FD0C4',
  pink: '#FF859C',
  glassFill: 'rgba(13, 27, 48, 0.62)',
  glassBorder: 'rgba(125, 211, 252, 0.38)',
  textDim: 'rgba(191, 227, 255, 0.78)',
};

export const PreGameTutorial = memo(function PreGameTutorialInner({
  visible,
  onComplete,
  onSkip,
}: PreGameTutorialProps) {
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const [mounted, setMounted] = useState(visible);

  // Transition & entrance animations
  const overlayFade = useRef(new Animated.Value(0)).current;
  const overlayScale = useRef(new Animated.Value(0.96)).current;
  const screenSlide = useRef(new Animated.Value(0)).current;

  // Screen 1: Feed swipe demo
  const feedLoop = useRef(new Animated.Value(0)).current;
  // Screen 2: Pad swipe demo
  const padLoop = useRef(new Animated.Value(0)).current;
  // Screen 3: Victory / food eating demo
  const eatAnim = useRef(new Animated.Value(0)).current;

  // Active direction feedback on Screen 2
  const [userActiveDir, setUserActiveDir] = useState<'right' | 'up' | null>(null);

  // User interaction flags to prevent double-advancing
  const hasInteractedRef = useRef<boolean>(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  // Handle step transition
  const goToStep = useCallback(
    (nextStep: 0 | 1 | 2) => {
      clearAutoTimer();
      hasInteractedRef.current = false;
      setUserActiveDir(null);

      Animated.sequence([
        Animated.timing(screenSlide, {
          toValue: nextStep > currentStep ? -1 : 1,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentStep(nextStep);
        screenSlide.setValue(nextStep > currentStep ? 1 : -1);
        Animated.spring(screenSlide, {
          toValue: 0,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }).start();
      });
    },
    [clearAutoTimer, currentStep, screenSlide],
  );

  // Dismiss animation into the game
  const handleFinish = useCallback(() => {
    clearAutoTimer();
    Animated.parallel([
      Animated.timing(overlayFade, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(overlayScale, {
        toValue: 1.05,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onComplete();
      }
    });
  }, [clearAutoTimer, onComplete, overlayFade, overlayScale]);

  const handleSkip = useCallback(() => {
    clearAutoTimer();
    Animated.timing(overlayFade, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onSkip();
      }
    });
  }, [clearAutoTimer, onSkip, overlayFade]);

  // Mount & unmount handling
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setCurrentStep(0);
      overlayScale.setValue(0.96);
      screenSlide.setValue(0);
      Animated.parallel([
        Animated.timing(overlayFade, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(overlayScale, {
          toValue: 1,
          friction: 7,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(overlayFade, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, overlayFade, overlayScale, screenSlide]);

  // Step 0: Feed Swipe Loop & Auto-advance fallback
  useEffect(() => {
    if (!mounted || currentStep !== 0) return;
    feedLoop.setValue(0);
    const anim = Animated.loop(
      Animated.timing(feedLoop, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { iterations: 2 },
    );
    anim.start();

    // Auto-advance fallback after 2 cycles
    autoTimerRef.current = setTimeout(() => {
      goToStep(1);
    }, 5800);

    return () => {
      anim.stop();
      clearAutoTimer();
    };
  }, [mounted, currentStep, feedLoop, goToStep, clearAutoTimer]);

  // Step 1: Pad Swipe Loop & Auto-advance fallback
  useEffect(() => {
    if (!mounted || currentStep !== 1) return;
    padLoop.setValue(0);
    const anim = Animated.loop(
      Animated.timing(padLoop, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { iterations: 2 },
    );
    anim.start();

    // Auto-advance fallback after demonstration
    autoTimerRef.current = setTimeout(() => {
      goToStep(2);
    }, 6600);

    return () => {
      anim.stop();
      clearAutoTimer();
    };
  }, [mounted, currentStep, padLoop, goToStep, clearAutoTimer]);

  // Step 2: Eat demo animation
  useEffect(() => {
    if (!mounted || currentStep !== 2) return;
    eatAnim.setValue(0);
    Animated.timing(eatAnim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mounted, currentStep, eatAnim]);

  // Screen 1 gesture responder (Vertical swipe up to next screen)
  const panResponderScreen1 = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy < -25) {
            hasInteractedRef.current = true;
            goToStep(1);
          }
        },
      }),
    [goToStep],
  );

  // Screen 2 gesture responder (Swiping inside the pad)
  const panResponderPad = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
        onPanResponderGrant: () => {
          hasInteractedRef.current = true;
        },
        onPanResponderMove: (_, gesture) => {
          if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
            setUserActiveDir(gesture.dx > 0 ? 'right' : null);
          } else {
            setUserActiveDir(gesture.dy < 0 ? 'up' : null);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) > 20 || Math.abs(gesture.dy) > 20) {
            setUserActiveDir(gesture.dx > 20 ? 'right' : gesture.dy < -20 ? 'up' : null);
            setTimeout(() => {
              goToStep(2);
            }, 450);
          } else {
            setUserActiveDir(null);
          }
        },
      }),
    [goToStep],
  );

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { opacity: overlayFade, transform: [{ scale: overlayScale }] },
      ]}
    >
      {/* Atmospheric night-arena backdrop: soft colour glows + drifting sparks */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.auroraSky} />
        <View style={styles.auroraSkyCore} />
        <View style={styles.auroraTeal} />
        <View style={styles.auroraGold} />
        <View style={[styles.spark, styles.sparkTeal, { top: 96, left: 34 }]} />
        <View style={[styles.spark, styles.sparkGold, { top: 168, right: 42 }]} />
        <View style={[styles.spark, styles.sparkWhite, { top: 240, left: 78 }]} />
        <View style={[styles.spark, styles.sparkPink, { top: 320, right: 88 }]} />
        <View style={[styles.spark, styles.sparkWhiteSm, { top: 128, right: 130 }]} />
        <View style={[styles.spark, styles.sparkTealSm, { bottom: 180, left: 46 }]} />
        <View style={[styles.spark, styles.sparkGoldSm, { bottom: 120, right: 60 }]} />
        <View style={[styles.spark, styles.sparkWhiteSm, { bottom: 250, right: 36 }]} />
      </View>

      {/* Header bar: Progress dots + Subtle Skip */}
      <View style={styles.headerBar}>
        <View style={styles.headerSpacer} />
        <View style={styles.dotsContainer}>
          {[0, 1, 2].map(idx => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentStep && styles.dotActive,
                idx < currentStep && styles.dotCompleted,
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={handleSkip}
          hitSlop={14}
          style={({ pressed }) => [styles.skipButton, pressed && styles.skipButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
        >
          <Text style={styles.skipText} allowFontScaling={false}>
            Skip
          </Text>
        </Pressable>
      </View>

      {/* Main Screen Content */}
      <Animated.View
        style={[
          styles.contentBox,
          {
            transform: [
              {
                translateX: screenSlide.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-360, 0, 360],
                }),
              },
            ],
          },
        ]}
      >
        {currentStep === 0 && (
          <Screen1Feed
            feedLoop={feedLoop}
            panResponder={panResponderScreen1}
            onManualAdvance={() => goToStep(1)}
          />
        )}
        {currentStep === 1 && (
          <Screen2Control
            padLoop={padLoop}
            panResponder={panResponderPad}
            userActiveDir={userActiveDir}
            onManualAdvance={() => goToStep(2)}
          />
        )}
        {currentStep === 2 && (
          <Screen3Ready eatAnim={eatAnim} onPlay={handleFinish} />
        )}
      </Animated.View>
    </Animated.View>
  );
});

/* ==========================================================================
   SHARED GAME-ART PIECES (drawn with views, matching the live game render)
   ========================================================================== */

/**
 * The game's googly-eyed snake, head leading on the right — the direction it
 * travels in every tutorial scene. Later siblings stack on top, so the head
 * naturally overlaps its first segment just like the game's renderer.
 */
function SnakeActor({ segments = 2 }: { segments?: number }) {
  return (
    <View style={styles.snakeRow}>
      <View style={styles.actorTail} />
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={[styles.actorSegment, i % 2 === 1 && styles.actorSegmentAlt]}
        />
      ))}
      <View style={styles.actorHead}>
        <View style={styles.actorEye}>
          <View style={styles.actorPupil} />
        </View>
        <View style={styles.actorEye}>
          <View style={styles.actorPupil} />
        </View>
      </View>
    </View>
  );
}

/** The game's berry: red button-like body, seed slit, stem and shine. */
function Berry({ size = 18 }: { size?: number }) {
  const r = size / 2;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[styles.berryStem, { width: size * 0.32, height: size * 0.24 }]} />
      <View
        style={[
          styles.berryBody,
          { width: size, height: size, borderRadius: r },
        ]}
      >
        <View style={[styles.berrySeed, { width: size * 0.34, height: size * 0.14 }]} />
        <View
          style={[
            styles.berryShine,
            { width: size * 0.24, height: size * 0.24, borderRadius: size * 0.12 },
          ]}
        />
      </View>
    </View>
  );
}

/** Cream checkerboard rows exactly like the arena floor. */
function CheckerRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.gridRow}>
          {Array.from({ length: cols }).map((__, c) => (
            <View
              key={c}
              style={[styles.gridCell, (r + c) % 2 === 0 ? styles.gridLight : styles.gridDark]}
            />
          ))}
        </View>
      ))}
    </>
  );
}

/* ==========================================================================
   SCREEN 1: DISCOVER THE GAME FEED
   ========================================================================== */

interface Screen1Props {
  feedLoop: Animated.Value;
  panResponder: ReturnType<typeof PanResponder.create>;
  onManualAdvance: () => void;
}

function Screen1Feed({ feedLoop, panResponder, onManualAdvance }: Screen1Props) {
  // Feed translation: 0 -> press (0-.10) -> drag up (.10-.44) -> elastic bounce (.44-.70) -> settle (.70-.90) -> reset
  const currentCardY = feedLoop.interpolate({
    inputRange: [0, 0.12, 0.44, 0.54, 0.72, 0.9, 1],
    outputRange: [0, 0, -150, -165, -145, -145, 0],
  });

  const nextCardY = feedLoop.interpolate({
    inputRange: [0, 0.12, 0.44, 0.54, 0.72, 0.9, 1],
    outputRange: [262, 262, -20, -35, -15, -15, 262],
  });

  const nextCardScale = feedLoop.interpolate({
    inputRange: [0, 0.12, 0.44, 0.72, 0.9, 1],
    outputRange: [0.9, 0.9, 1, 1, 1, 0.9],
  });

  const handY = feedLoop.interpolate({
    inputRange: [0, 0.12, 0.44, 0.6, 0.85, 1],
    outputRange: [70, 70, -80, -80, 110, 70],
  });

  const handOpacity = feedLoop.interpolate({
    inputRange: [0, 0.08, 0.58, 0.72, 0.95, 1],
    outputRange: [0, 1, 1, 0, 0, 1],
  });

  const rippleScale = feedLoop.interpolate({
    inputRange: [0, 0.08, 0.22, 1],
    outputRange: [0.4, 0.6, 1.3, 1.3],
  });

  const rippleOpacity = feedLoop.interpolate({
    inputRange: [0, 0.08, 0.22, 0.35, 1],
    outputRange: [0, 0.9, 0.5, 0, 0],
  });

  return (
    <View style={styles.screenWrapper} {...panResponder.panHandlers}>
      {/* Title section */}
      <View style={styles.titleSection}>
        <Text style={styles.screenTitle} allowFontScaling={false}>
          SWIPE TO EXPLORE
        </Text>
        <Text style={styles.screenSubtitle} allowFontScaling={false}>
          Discover more games
        </Text>
      </View>

      {/* Miniature Feed Preview: a glass phone frame over the night arena */}
      <View style={styles.feedGlowPlatter} pointerEvents="none" />
      <View style={styles.feedPreviewBox}>
        {/* Peek of game above */}
        <View style={styles.feedCardTopPeek}>
          <Text style={styles.peekText} allowFontScaling={false}>
            🧩 Color Match
          </Text>
        </View>

        {/* Current Game Card: Cute Snake — the game's real daylight look */}
        <Animated.View
          style={[
            styles.feedCard,
            styles.snakeCard,
            { transform: [{ translateY: currentCardY }] },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.badgePill}>
              <Text style={styles.badgeText} allowFontScaling={false}>
                CURRENT GAME
              </Text>
            </View>
            <Text style={styles.cardRating} allowFontScaling={false}>
              ★ 4.9
            </Text>
          </View>

          {/* Mini Cute Snake arena, straight from the game's renderer */}
          <View style={styles.snakeArtContainer}>
            <View style={styles.miniBoard}>
              <View style={styles.miniBoardInner}>
                <CheckerRows rows={4} cols={6} />
              </View>
              <View style={styles.miniSnakePos}>
                <SnakeActor segments={1} />
              </View>
              <View style={styles.miniBerryPos}>
                <Berry size={15} />
              </View>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.cardTitle} allowFontScaling={false}>
              Cute Snake
            </Text>
            <Text style={styles.cardGenre} allowFontScaling={false}>
              Arcade • Endless Slither
            </Text>
          </View>
        </Animated.View>

        {/* Next Game Card: Tap Cannon */}
        <Animated.View
          style={[
            styles.feedCard,
            styles.cannonCard,
            {
              transform: [
                { translateY: nextCardY },
                { scale: nextCardScale },
              ],
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.badgePill, styles.badgePillNext]}>
              <Text style={[styles.badgeText, styles.badgeTextNext]} allowFontScaling={false}>
                NEXT GAME
              </Text>
            </View>
            <Text style={styles.cardRating} allowFontScaling={false}>
              ★ 4.8
            </Text>
          </View>

          <View style={styles.cannonArtContainer}>
            <Text style={styles.cannonArtEmoji} allowFontScaling={false}>
              🚀
            </Text>
            <View style={styles.cannonTargetBadge}>
              <Text style={styles.cannonTargetText} allowFontScaling={false}>
                🎯 30s CHASE
              </Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <Text style={styles.cardTitle} allowFontScaling={false}>
              Tap Cannon
            </Text>
            <Text style={styles.cardGenre} allowFontScaling={false}>
              Action • Fast Blaster
            </Text>
          </View>
        </Animated.View>

        {/* Animated Finger Performing Swipe Up */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.feedHandWrap,
            {
              opacity: handOpacity,
              transform: [{ translateY: handY }],
            },
          ]}
        >
          {/* Touch Ripple */}
          <Animated.View
            style={[
              styles.touchRipple,
              {
                opacity: rippleOpacity,
                transform: [{ scale: rippleScale }],
              },
            ]}
          />
          <TutorialHand />
        </Animated.View>
      </View>

      {/* Swipe up hint bar */}
      <Pressable onPress={onManualAdvance} style={styles.swipeHintPill}>
        <Text style={styles.swipeHintArrow} allowFontScaling={false}>
          ▲
        </Text>
        <Text style={styles.swipeHintText} allowFontScaling={false}>
          Swipe up to continue
        </Text>
      </Pressable>
    </View>
  );
}

/* ==========================================================================
   SCREEN 2: LEARN THE SNAKE CONTROL (RECTANGULAR SWIPE PAD HERO)
   ========================================================================== */

interface Screen2Props {
  padLoop: Animated.Value;
  panResponder: ReturnType<typeof PanResponder.create>;
  userActiveDir: 'right' | 'up' | null;
  onManualAdvance: () => void;
}

function Screen2Control({
  padLoop,
  panResponder,
  userActiveDir,
  onManualAdvance,
}: Screen2Props) {
  const demoHandX = padLoop.interpolate({
    inputRange: [0, 0.18, 0.42, 0.56, 0.64, 0.88, 1],
    outputRange: [0, 0, 52, 0, 0, 0, 0],
  });

  const demoHandY = padLoop.interpolate({
    inputRange: [0, 0.18, 0.42, 0.56, 0.64, 0.88, 1],
    outputRange: [0, 0, 0, 0, 0, -42, 0],
  });

  const demoHandOpacity = padLoop.interpolate({
    inputRange: [0, 0.08, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });

  const isDemoRight = padLoop.interpolate({
    inputRange: [0, 0.18, 0.22, 0.44, 0.52, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });

  const isDemoUp = padLoop.interpolate({
    inputRange: [0, 0.62, 0.66, 0.88, 0.94, 1],
    outputRange: [0, 0, 1, 1, 0, 0],
  });

  // Snake body position reacting to swipe:
  const snakeMoveX = padLoop.interpolate({
    inputRange: [0, 0.2, 0.42, 0.62, 0.88, 1],
    outputRange: [0, 0, 24, 24, 24, 0],
  });

  const snakeMoveY = padLoop.interpolate({
    inputRange: [0, 0.62, 0.86, 1],
    outputRange: [0, 0, -20, 0],
  });

  const activeRight = userActiveDir === 'right';
  const activeUp = userActiveDir === 'up';

  return (
    <View style={styles.screenWrapper}>
      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={styles.screenTitle} allowFontScaling={false}>
          SWIPE TO STEER
        </Text>
        <Text style={styles.screenSubtitle} allowFontScaling={false}>
          Swipe inside the pad to move
        </Text>
      </View>

      {/* Mini Board: Cause and effect display */}
      <View style={styles.controlBoardWrap}>
        <View style={styles.controlBoard}>
          <CheckerRows rows={3} cols={6} />

          {/* Target berry food */}
          <View style={styles.targetFood}>
            <Berry size={18} />
          </View>

          {/* Slithering Snake Actor */}
          <Animated.View
            style={[
              styles.snakeActorPos,
              {
                transform: [
                  { translateX: activeRight ? 24 : snakeMoveX },
                  { translateY: activeUp ? -20 : snakeMoveY },
                ],
              },
            ]}
          >
            <SnakeActor segments={1} />
          </Animated.View>
        </View>
      </View>

      {/* REAL RECTANGULAR SWIPE PAD HERO — glass pad from the live game */}
      <View style={styles.swipePadContainer} {...panResponder.panHandlers}>
        <View style={styles.padGlowPlatter} pointerEvents="none" />
        <View style={[styles.swipePadBox, (activeRight || activeUp) && styles.swipePadBoxActive]}>
          {/* Subtle guide lines */}
          <View style={styles.padLineHorizontal} />
          <View style={styles.padLineVertical} />

          {/* Center Tactile Bead & Dashed Ring */}
          <View style={styles.centerDashedRing} />
          <View style={styles.tactileDisc}>
            <View
              style={[
                styles.tactileCenterDot,
                (activeRight || activeUp) && styles.tactileCenterDotActive,
              ]}
            />
          </View>

          {/* UP Arrow */}
          <AnimatedArrow
            direction="up"
            isLit={activeUp}
            demoLit={isDemoUp}
            top={14}
            left={116}
          />

          {/* DOWN Arrow */}
          <AnimatedArrow
            direction="down"
            isLit={userActiveDir === null ? false : false}
            demoLit={new Animated.Value(0)}
            bottom={14}
            left={116}
          />

          {/* LEFT Arrow */}
          <AnimatedArrow
            direction="left"
            isLit={false}
            demoLit={new Animated.Value(0)}
            top={74}
            left={14}
          />

          {/* RIGHT Arrow */}
          <AnimatedArrow
            direction="right"
            isLit={activeRight}
            demoLit={isDemoRight}
            top={74}
            right={14}
          />

          {/* Animated Hand for Demonstration (hidden when user touches) */}
          {!userActiveDir && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.padHandWrap,
                {
                  opacity: demoHandOpacity,
                  transform: [
                    { translateX: demoHandX },
                    { translateY: demoHandY },
                  ],
                },
              ]}
            >
              <TutorialHand />
            </Animated.View>
          )}
        </View>
      </View>

      {/* Supporting hint */}
      <Pressable onPress={onManualAdvance} style={styles.swipeHintPill}>
        <Text style={styles.swipeHintText} allowFontScaling={false}>
          Tap or swipe to continue ▶
        </Text>
      </Pressable>
    </View>
  );
}

/* ==========================================================================
   SCREEN 3: READY TO PLAY (HERO CELEBRATION & LET'S PLAY)
   ========================================================================== */

interface Screen3Props {
  eatAnim: Animated.Value;
  onPlay: () => void;
}

function Screen3Ready({ eatAnim, onPlay }: Screen3Props) {
  const snakeX = eatAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 108, 108],
  });

  const berryScale = eatAnim.interpolate({
    inputRange: [0, 0.38, 0.46, 1],
    outputRange: [1, 1.15, 0, 0],
  });

  const sparkScale = eatAnim.interpolate({
    inputRange: [0, 0.42, 0.7, 1],
    outputRange: [0, 0.3, 1.3, 1.1],
  });

  const sparkOpacity = eatAnim.interpolate({
    inputRange: [0, 0.42, 0.55, 0.9, 1],
    outputRange: [0, 1, 1, 0.4, 0],
  });

  const buttonPop = eatAnim.interpolate({
    inputRange: [0, 0.55, 0.85, 1],
    outputRange: [0.85, 0.85, 1.05, 1],
  });

  const buttonOpacity = eatAnim.interpolate({
    inputRange: [0, 0.55, 0.8, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={styles.screenWrapper}>
      {/* Title */}
      <View style={styles.titleSection}>
        <View style={styles.crownBadge}>
          <View style={styles.crownSpikeL} />
          <View style={styles.crownSpikeM} />
          <View style={styles.crownSpikeR} />
          <View style={styles.crownBase} />
        </View>
        <Text style={[styles.screenTitle, styles.readyTitle]} allowFontScaling={false}>
          READY?
        </Text>
        <Text style={styles.screenSubtitle} allowFontScaling={false}>
          Slither, eat berries &amp; set high scores!
        </Text>
      </View>

      {/* Hero Interactive Mini Scene */}
      <View style={styles.heroSceneContainer}>
        <View style={styles.heroGlowPlatter} pointerEvents="none" />
        <View style={styles.heroBoard}>
          <CheckerRows rows={4} cols={7} />

          {/* Snake reaching food */}
          <Animated.View
            style={[
              styles.heroSnakePos,
              { transform: [{ translateX: snakeX }] },
            ]}
          >
            <SnakeActor segments={2} />
          </Animated.View>

          {/* Berry with eating shrink animation */}
          <Animated.View
            style={[
              styles.heroBerryPos,
              { transform: [{ scale: berryScale }] },
            ]}
          >
            <Berry size={18} />
          </Animated.View>

          {/* Confetti & Star burst on eating */}
          <Animated.View
            style={[
              styles.sparkBurst,
              {
                opacity: sparkOpacity,
                transform: [{ scale: sparkScale }],
              },
            ]}
          >
            <Text style={styles.sparkEmoji} allowFontScaling={false}>
              ✨
            </Text>
            <View style={[styles.particle, styles.particleGold, { top: -14, left: 10 }]} />
            <View style={[styles.particle, styles.particleLime, { top: 12, left: 24 }]} />
            <View style={[styles.particle, styles.particlePink, { top: -12, left: -14 }]} />
            <View style={[styles.particle, styles.particleTeal, { top: 16, left: -10 }]} />
          </Animated.View>
        </View>
      </View>

      {/* Primary Action Button: LET'S PLAY */}
      <Animated.View
        style={[
          styles.ctaButtonWrap,
          {
            opacity: buttonOpacity,
            transform: [{ scale: buttonPop }],
          },
        ]}
      >
        <Pressable
          onPress={onPlay}
          style={({ pressed }) => [
            styles.playButton,
            pressed && styles.playButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Let's Play"
        >
          <Text style={styles.playButtonText} allowFontScaling={false}>
            LET&apos;S PLAY
          </Text>
          <View style={styles.playIconCircle}>
            <Text style={styles.playArrowIcon} allowFontScaling={false}>
              ▶
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ==========================================================================
   ARROW COMPONENT WITH LIME FEEDBACK
   ========================================================================== */

interface ArrowProps {
  direction: 'up' | 'down' | 'left' | 'right';
  isLit: boolean;
  demoLit: Animated.AnimatedInterpolation<number> | Animated.Value;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

function AnimatedArrow({ direction, isLit, demoLit, top, bottom, left, right }: ArrowProps) {
  const rotation =
    direction === 'up'
      ? '0deg'
      : direction === 'right'
      ? '90deg'
      : direction === 'down'
      ? '180deg'
      : '270deg';

  return (
    <View style={[styles.arrowContainer, { top, bottom, left, right }]}>
      {/* Lime glow aura */}
      <Animated.View
        style={[
          styles.arrowGlowAura,
          {
            opacity: isLit
              ? 1
              : (demoLit as any).interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.4, 0.9],
                }),
          },
        ]}
      />
      {/* Sharp arrow triangle */}
      <Animated.View
        style={[
          styles.arrowTriangle,
          {
            transform: [{ rotate: rotation }],
            borderBottomColor: isLit
              ? THEME.snakeLime
              : ((demoLit as any).interpolate({
                  inputRange: [0, 1],
                  outputRange: ['rgba(255, 255, 255, 0.45)', THEME.snakeLime],
                }) as any),
          },
        ]}
      />
    </View>
  );
}

/* ==========================================================================
   STYLESHEET
   ========================================================================== */

const styles = StyleSheet.create({
  container: {
    backgroundColor: THEME.bgDeep,
    zIndex: 999,
  },

  /* -------- Night-arena atmosphere: layered colour glows + sparks -------- */
  auroraSky: {
    position: 'absolute',
    top: -260,
    left: -220,
    width: 560,
    height: 560,
    borderRadius: 280,
    backgroundColor: 'rgba(0, 175, 245, 0.055)',
  },
  auroraSkyCore: {
    position: 'absolute',
    top: -150,
    left: -110,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(0, 175, 245, 0.055)',
  },
  auroraTeal: {
    position: 'absolute',
    bottom: -240,
    right: -220,
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: 'rgba(31, 208, 196, 0.05)',
  },
  auroraGold: {
    position: 'absolute',
    top: '34%',
    right: -230,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(255, 210, 31, 0.035)',
  },
  spark: {
    position: 'absolute',
    borderRadius: 3,
  },
  sparkWhite: { width: 4, height: 4, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  sparkWhiteSm: { width: 2.5, height: 2.5, backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  sparkTeal: { width: 5, height: 5, backgroundColor: 'rgba(31, 208, 196, 0.55)' },
  sparkTealSm: { width: 3, height: 3, backgroundColor: 'rgba(31, 208, 196, 0.4)' },
  sparkGold: { width: 4, height: 4, backgroundColor: 'rgba(255, 210, 31, 0.55)' },
  sparkGoldSm: { width: 3, height: 3, backgroundColor: 'rgba(255, 210, 31, 0.4)' },
  sparkPink: { width: 4, height: 4, backgroundColor: 'rgba(255, 133, 156, 0.45)' },

  // Header Bar
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    height: 54,
  },
  headerSpacer: {
    width: 50,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(125, 211, 252, 0.25)',
  },
  dotActive: {
    width: 22,
    borderRadius: 5,
    backgroundColor: THEME.gold,
    shadowColor: THEME.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  dotCompleted: {
    backgroundColor: THEME.snakeLime,
  },

  // Skip Button — the app's glass pill
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: THEME.glassFill,
    borderWidth: 1,
    borderColor: THEME.glassBorder,
  },
  skipButtonPressed: {
    opacity: 0.65,
  },
  skipText: {
    color: 'rgba(226, 244, 255, 0.92)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Main Screen Content Box
  contentBox: {
    flex: 1,
  },
  screenWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
  },

  // Titles
  titleSection: {
    alignItems: 'center',
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.white,
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 175, 245, 0.65)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  screenSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.textDim,
    marginTop: 5,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  readyTitle: {
    fontSize: 30,
    color: THEME.gold,
    textShadowColor: 'rgba(255, 210, 31, 0.55)',
    textShadowRadius: 16,
  },

  /* -------- Shared game-art pieces -------- */
  snakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actorHead: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: THEME.snakeGreen,
    borderWidth: 2,
    borderColor: THEME.snakeOutline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    marginLeft: -6,
    zIndex: 3,
  },
  actorEye: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.white,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorPupil: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0B0F14',
  },
  actorSegment: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: THEME.snakeLime,
    marginLeft: -6,
    borderWidth: 1.5,
    borderColor: THEME.snakeOutline,
    zIndex: 2,
  },
  actorSegmentAlt: {
    backgroundColor: THEME.snakeGreen,
  },
  actorTail: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: THEME.snakeGreen,
    borderWidth: 1.5,
    borderColor: THEME.snakeOutline,
    zIndex: 1,
  },
  berryStem: {
    borderRadius: 3,
    backgroundColor: THEME.foodStem,
    marginBottom: -2,
    transform: [{ rotate: '-18deg' }],
  },
  berryBody: {
    backgroundColor: THEME.foodRed,
    borderWidth: 1.5,
    borderColor: THEME.foodDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  berrySeed: {
    borderRadius: 2,
    backgroundColor: '#1F100E',
    transform: [{ rotate: '24deg' }],
  },
  berryShine: {
    position: 'absolute',
    top: 2,
    left: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },

  // ================= SCREEN 1 STYLES =================
  feedGlowPlatter: {
    position: 'absolute',
    alignSelf: 'center',
    top: '18%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(0, 175, 245, 0.09)',
  },
  feedPreviewBox: {
    width: 250,
    height: 330,
    borderRadius: 26,
    backgroundColor: 'rgba(10, 22, 41, 0.92)',
    borderWidth: 2,
    borderColor: THEME.glassBorder,
    overflow: 'hidden',
    alignItems: 'center',
    position: 'relative',
    shadowColor: THEME.skyBlue,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  feedCardTopPeek: {
    position: 'absolute',
    top: -24,
    width: 210,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#5B2AA8',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    opacity: 0.75,
  },
  peekText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  feedCard: {
    position: 'absolute',
    top: 26,
    width: 218,
    height: 275,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  snakeCard: {
    backgroundColor: THEME.skyBlue,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  cannonCard: {
    backgroundColor: '#2A1045',
    borderColor: 'rgba(216, 180, 254, 0.45)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: THEME.navy,
  },
  badgePillNext: {
    backgroundColor: '#FF6B00',
  },
  badgeText: {
    color: THEME.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  badgeTextNext: {
    color: THEME.white,
  },
  cardRating: {
    color: THEME.gold,
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  snakeArtContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  miniBoard: {
    width: 132,
    height: 96,
    borderRadius: 12,
    backgroundColor: THEME.boardLight,
    borderWidth: 4,
    borderColor: THEME.navy,
    position: 'relative',
    overflow: 'hidden',
  },
  miniBoardInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  miniSnakePos: {
    position: 'absolute',
    left: 18,
    top: 32,
  },
  miniBerryPos: {
    position: 'absolute',
    right: 14,
    top: 30,
  },
  cardFooter: {
    marginTop: 6,
  },
  cardTitle: {
    color: THEME.white,
    fontSize: 17,
    fontWeight: '900',
    textShadowColor: 'rgba(15, 23, 42, 0.4)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  cardGenre: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  cannonArtContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  cannonArtEmoji: {
    fontSize: 38,
  },
  cannonTargetBadge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  cannonTargetText: {
    color: '#FDE047',
    fontSize: 11,
    fontWeight: '800',
  },

  feedHandWrap: {
    position: 'absolute',
    left: 100,
    top: 150,
  },
  touchRipple: {
    position: 'absolute',
    left: HAND_TIP.x - 22,
    top: HAND_TIP.y - 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: THEME.white,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },

  swipeHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: THEME.glassFill,
    borderWidth: 1,
    borderColor: THEME.glassBorder,
  },
  swipeHintArrow: {
    color: THEME.snakeLime,
    fontSize: 11,
    fontWeight: '900',
  },
  swipeHintText: {
    color: 'rgba(226, 244, 255, 0.92)',
    fontSize: 12,
    fontWeight: '700',
  },

  // ================= SCREEN 2 STYLES =================
  controlBoardWrap: {
    alignItems: 'center',
    marginVertical: 4,
  },
  controlBoard: {
    width: 220,
    height: 105,
    borderRadius: 16,
    backgroundColor: THEME.boardLight,
    borderWidth: 4,
    borderColor: THEME.navy,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: THEME.skyBlue,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridCell: {
    flex: 1,
  },
  gridLight: {
    backgroundColor: THEME.boardLight,
  },
  gridDark: {
    backgroundColor: THEME.boardDark,
  },
  targetFood: {
    position: 'absolute',
    right: 32,
    top: 14,
  },
  snakeActorPos: {
    position: 'absolute',
    left: 44,
    top: 44,
  },

  // REAL SWIPE PAD HERO — the game's translucent glass control, night-lit
  swipePadContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  padGlowPlatter: {
    position: 'absolute',
    width: 300,
    height: 216,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 175, 245, 0.10)',
  },
  swipePadBox: {
    width: 260,
    height: 176,
    borderRadius: 24,
    backgroundColor: 'rgba(148, 199, 255, 0.10)',
    borderWidth: 2,
    borderColor: 'rgba(191, 227, 255, 0.42)',
    position: 'relative',
    shadowColor: THEME.skyBlue,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  swipePadBoxActive: {
    borderColor: THEME.snakeLime,
    backgroundColor: 'rgba(131, 204, 67, 0.12)',
  },
  padLineHorizontal: {
    position: 'absolute',
    top: 87,
    left: 40,
    right: 40,
    height: 1.5,
    backgroundColor: 'rgba(191, 227, 255, 0.16)',
  },
  padLineVertical: {
    position: 'absolute',
    left: 129,
    top: 30,
    bottom: 30,
    width: 1.5,
    backgroundColor: 'rgba(191, 227, 255, 0.16)',
  },
  centerDashedRing: {
    position: 'absolute',
    left: 108,
    top: 66,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(191, 227, 255, 0.30)',
    borderStyle: 'dashed',
  },
  tactileDisc: {
    position: 'absolute',
    left: 116,
    top: 74,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tactileCenterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.snakeLime,
  },
  tactileCenterDotActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: THEME.snakeGreen,
  },
  padHandWrap: {
    position: 'absolute',
    left: 114,
    top: 72,
    zIndex: 10,
  },

  // ARROWS
  arrowContainer: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlowAura: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(131, 204, 67, 0.35)',
  },
  arrowTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255, 255, 255, 0.5)',
  },

  // ================= SCREEN 3 STYLES =================
  crownBadge: {
    width: 34,
    height: 20,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  crownBase: {
    width: 30,
    height: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: THEME.gold,
  },
  crownSpikeL: {
    position: 'absolute',
    bottom: 6,
    left: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: THEME.gold,
  },
  crownSpikeM: {
    position: 'absolute',
    bottom: 6,
    left: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: THEME.gold,
  },
  crownSpikeR: {
    position: 'absolute',
    bottom: 6,
    right: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: THEME.gold,
  },
  heroSceneContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  heroGlowPlatter: {
    position: 'absolute',
    width: 310,
    height: 190,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 210, 31, 0.07)',
  },
  heroBoard: {
    width: 260,
    height: 140,
    borderRadius: 20,
    backgroundColor: THEME.boardLight,
    borderWidth: 5,
    borderColor: THEME.navy,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: THEME.gold,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  heroSnakePos: {
    position: 'absolute',
    left: 36,
    top: 50,
  },
  heroBerryPos: {
    position: 'absolute',
    right: 48,
    top: 50,
  },
  sparkBurst: {
    position: 'absolute',
    right: 40,
    top: 44,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkEmoji: {
    fontSize: 26,
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  particleGold: {
    backgroundColor: THEME.gold,
  },
  particleLime: {
    backgroundColor: THEME.snakeLime,
  },
  particlePink: {
    backgroundColor: THEME.pink,
  },
  particleTeal: {
    backgroundColor: THEME.teal,
  },

  // CTA BUTTON — the game's chunky "Play Again" green, night-lit
  ctaButtonWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: 230,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1DB13F',
    borderWidth: 2,
    borderColor: '#4ADE80',
    borderBottomWidth: 5,
    borderBottomColor: '#0F7A2A',
    shadowColor: '#22C55E',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  playButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  playButtonText: {
    color: THEME.white,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  playIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playArrowIcon: {
    color: THEME.white,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 2,
  },
});
