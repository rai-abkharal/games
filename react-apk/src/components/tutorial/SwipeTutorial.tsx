import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n/translations';
import { GLASS, HUD } from '../../theme/themes';
import { HAND_TIP, TutorialHand } from './TutorialHand';

/**
 * First-run coach mark for the feed gesture: a miniature page stack — built
 * from the same dark-navy card, glass border and placeholder identity the
 * real pages use — with a hand dragging the current card up so the next one
 * rises into place. Runs on the plain Animated driver like FeedDock.
 *
 * The overlay never owns the screen: every layer except the "Got it" pill is
 * transparent to touches, and the parent dismisses it the moment the player
 * touches the feed — performing the very gesture being taught included.
 */

interface Props {
  visible: boolean;
  onGotIt: () => void;
}

const CARD_W = 152;
const CARD_H = 94;
const NEXT_OFFSET = 26;
const LOOP_MS = 2600;

export const SwipeTutorial = memo(function SwipeTutorialInner({ visible, onGotIt }: Props) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const loop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const enter = Animated.timing(fade, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      const cycle = Animated.loop(
        Animated.timing(loop, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }),
      );
      enter.start();
      cycle.start();
      return () => {
        enter.stop();
        cycle.stop();
        loop.setValue(0);
      };
    }
    const exit = Animated.timing(fade, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    exit.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => exit.stop();
  }, [visible, fade, loop]);

  if (!mounted) return null;

  // One driver, piecewise keyframes: press (0–.08), drag (.08–.40, fast-out),
  // hold (.40–.72), then an invisible reset (.72–1) so the cycle loops clean.
  const groupOpacity = loop.interpolate({ inputRange: [0, 0.72, 0.8, 0.9, 1], outputRange: [1, 1, 0, 0, 1] });
  const handY = loop.interpolate({
    inputRange: [0, 0.08, 0.24, 0.4, 0.8, 0.9, 1],
    outputRange: [0, 0, -64, -88, -88, 0, 0],
  });
  const haloOpacity = loop.interpolate({
    inputRange: [0, 0.03, 0.08, 0.36, 0.44, 1],
    outputRange: [0, 0, 0.85, 0.85, 0, 0],
  });
  const haloScale = loop.interpolate({ inputRange: [0, 0.08, 0.44, 1], outputRange: [0.5, 1, 1.15, 1.15] });
  const cardTopY = loop.interpolate({
    inputRange: [0, 0.08, 0.24, 0.4, 0.8, 0.9, 1],
    outputRange: [0, 0, -80, -110, -110, 0, 0],
  });
  const cardTopOpacity = loop.interpolate({
    inputRange: [0, 0.08, 0.3, 0.4, 0.8, 0.9, 1],
    outputRange: [1, 1, 0.5, 0, 0, 1, 1],
  });
  const cardNextY = loop.interpolate({
    inputRange: [0, 0.08, 0.4, 0.8, 0.9, 1],
    outputRange: [NEXT_OFFSET, NEXT_OFFSET, 0, 0, NEXT_OFFSET, NEXT_OFFSET],
  });
  const cardNextScale = loop.interpolate({
    inputRange: [0, 0.08, 0.4, 0.8, 0.9, 1],
    outputRange: [0.92, 0.92, 1, 1, 0.92, 0.92],
  });
  const cardNextOpacity = loop.interpolate({
    inputRange: [0, 0.08, 0.4, 0.8, 0.9, 1],
    outputRange: [0.7, 0.7, 1, 1, 0.7, 0.7],
  });
  const chevLowOpacity = loop.interpolate({
    inputRange: [0, 0.08, 0.16, 0.28, 0.4, 1],
    outputRange: [0.2, 0.35, 1, 0.3, 0.2, 0.2],
  });
  const chevHighOpacity = loop.interpolate({
    inputRange: [0, 0.08, 0.2, 0.32, 0.44, 1],
    outputRange: [0.2, 0.2, 1, 0.35, 0.2, 0.2],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} pointerEvents="box-none">
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
      <View style={styles.content} pointerEvents="box-none">
        <View pointerEvents="none" style={styles.demoColumn}>
          <Animated.View style={{ opacity: groupOpacity }}>
            <Animated.View style={[styles.chevron, { opacity: chevHighOpacity }]}>
              <View style={[styles.chevBar, styles.chevLeft]} />
              <View style={[styles.chevBar, styles.chevRight]} />
            </Animated.View>
            <Animated.View style={[styles.chevron, styles.chevronGap, { opacity: chevLowOpacity }]}>
              <View style={[styles.chevBar, styles.chevLeft]} />
              <View style={[styles.chevBar, styles.chevRight]} />
            </Animated.View>

            <View style={styles.stack}>
              <Animated.View
                style={[
                  styles.card,
                  styles.cardAbs,
                  { opacity: cardNextOpacity, transform: [{ translateY: cardNextY }, { scale: cardNextScale }] },
                ]}
              >
                <MiniPage dim />
              </Animated.View>
              <Animated.View
                style={[styles.card, styles.cardAbs, { opacity: cardTopOpacity, transform: [{ translateY: cardTopY }] }]}
              >
                <MiniPage />
              </Animated.View>
              <Animated.View style={[styles.handWrap, { transform: [{ translateY: handY }] }]}>
                <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
                <TutorialHand />
              </Animated.View>
            </View>
          </Animated.View>

          <Text style={styles.title} allowFontScaling={false}>
            {t('tutSwipeTitle')}
          </Text>
          <Text style={styles.body} allowFontScaling={false}>
            {t('tutSwipeBody')}
          </Text>
        </View>

        <Pressable
          onPress={onGotIt}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('gotIt')}
        >
          <Text style={styles.pillText} allowFontScaling={false}>
            {t('gotIt')}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

/** The page in miniature: the placeholder's logo circle, title and meta bars. */
function MiniPage({ dim = false }: { dim?: boolean }) {
  return (
    <View style={styles.cardRow}>
      <View style={[styles.miniLogo, dim && styles.miniDim]}>
        <Text style={styles.miniEmoji} allowFontScaling={false}>
          🎮
        </Text>
      </View>
      <View style={styles.miniLines}>
        <View style={[styles.miniTitle, dim && styles.miniDim]} />
        <View style={[styles.miniMeta, dim && styles.miniDim]} />
        <View style={[styles.miniAccent, dim && styles.miniDim]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 30 },
  scrim: { backgroundColor: 'rgba(6, 11, 25, 0.82)' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 34 },
  demoColumn: { alignItems: 'center' },

  chevron: { width: 22, height: 8, alignSelf: 'center' },
  chevronGap: { marginTop: 3, marginBottom: 14 },
  chevBar: { position: 'absolute', top: 3, width: 13, height: 3, borderRadius: 1.5, backgroundColor: HUD.muted },
  chevLeft: { left: 0, transform: [{ rotate: '-32deg' }] },
  chevRight: { right: 0, transform: [{ rotate: '32deg' }] },

  stack: { width: CARD_W, height: CARD_H + NEXT_OFFSET, marginBottom: 4 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    backgroundColor: '#0D1730',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
    overflow: 'hidden',
  },
  cardAbs: { position: 'absolute', top: 0, left: 0 },
  cardRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  miniLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GLASS.placeholderCircle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniEmoji: { fontSize: 14 },
  miniLines: { marginLeft: 11 },
  miniTitle: { width: 62, height: 8, borderRadius: 4, backgroundColor: 'rgba(248, 250, 252, 0.30)' },
  miniMeta: { marginTop: 7, width: 42, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(248, 250, 252, 0.14)' },
  miniAccent: { marginTop: 8, width: 30, height: 9, borderRadius: 4.5, backgroundColor: 'rgba(56, 189, 248, 0.40)' },
  miniDim: { opacity: 0.55 },

  handWrap: {
    position: 'absolute',
    left: CARD_W / 2 - HAND_TIP.x + 10,
    top: CARD_H - 24,
  },
  halo: {
    position: 'absolute',
    left: HAND_TIP.x - 27,
    top: HAND_TIP.y - 27,
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(248, 250, 252, 0.9)',
    backgroundColor: 'rgba(248, 250, 252, 0.12)',
  },

  title: {
    marginTop: 26,
    color: HUD.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    color: HUD.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  pill: {
    marginTop: 30,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: GLASS.handle.fill,
    borderWidth: 1,
    borderColor: GLASS.handle.border,
  },
  pillPressed: { opacity: 0.7 },
  pillText: { color: HUD.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
});
