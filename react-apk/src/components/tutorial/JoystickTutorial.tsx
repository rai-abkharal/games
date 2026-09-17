import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n/translations';
import { GLASS, HUD } from '../../theme/themes';
import type { GameItem, TouchZone } from '../../types/game';
import { HAND_TIP, TutorialHand } from './TutorialHand';

/**
 * First-run coach mark for joystick games, drawn over the live game at the
 * exact spot the game itself declared: the admin-defined touch zone whose
 * name mentions a joystick (the same zones the pager already respects, so
 * the hint is always where the real control is). The game stays visible and
 * playable underneath — the area outside the zone is dimmed with plain
 * rectangles, never covered, and only the two pills accept touches.
 *
 * A ghost stick (ring + knob) sweeps right and left under a drawn hand;
 * the chevron on the side being dragged lights up.
 */

interface Props {
  visible: boolean;
  zone: TouchZone;
  stageWidth: number;
  stageHeight: number;
  onGotIt: () => void;
}

/** The zone the coach mark anchors to, or null when the game has no joystick. */
export function findJoystickZone(game: GameItem): TouchZone | null {
  const byZone = game.touchZones?.find(zone => /joy/i.test(zone.name ?? ''));
  if (byZone) return byZone;
  // Admin marked the control style but drew no zone: assume the usual
  // bottom-left placement virtual joysticks use.
  if (game.controls?.some(control => /joy/i.test(control))) {
    return { name: 'joystick', x: 0.04, y: 0.6, width: 0.5, height: 0.36 };
  }
  return null;
}

const WRAP = 164;
const C = WRAP / 2;
const RING = 96;
const KNOB = 44;
const SWEEP = 26;
const LOOP_MS = 3000;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const JoystickTutorial = memo(function JoystickTutorialInner({
  visible,
  zone,
  stageWidth,
  stageHeight,
  onGotIt,
}: Props) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.92)).current;
  const loop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const enter = Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      ]);
      const cycle = Animated.loop(
        Animated.timing(loop, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }),
      );
      enter.start();
      cycle.start();
      return () => {
        enter.stop();
        cycle.stop();
        loop.setValue(0);
        pop.setValue(0.92);
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
  }, [visible, fade, pop, loop]);

  if (!mounted || stageWidth <= 0 || stageHeight <= 0) return null;

  // The admin zone in stage pixels, and a centre the ghost stick fits around.
  const rect = {
    left: clamp(zone.x, 0, 1) * stageWidth,
    top: clamp(zone.y, 0, 1) * stageHeight,
    width: clamp(zone.width, 0, 1) * stageWidth,
    height: clamp(zone.height, 0, 1) * stageHeight,
  };
  const cx = clamp(rect.left + rect.width / 2, C, stageWidth - C);
  const cy = clamp(rect.top + rect.height / 2, C, stageHeight - C);
  const labelTop = Math.max(12, rect.top - 56);
  const gotItTop = Math.min(cy + C + 6, stageHeight - 54);

  // press (0–.07) → drag right (.07–.25) → hold → sweep left (.32–.55) →
  // hold → back to centre (.62–.72) → release → idle.
  const knobX = loop.interpolate({
    inputRange: [0, 0.07, 0.25, 0.32, 0.55, 0.62, 0.72, 1],
    outputRange: [0, 0, SWEEP, SWEEP, -SWEEP, -SWEEP, 0, 0],
  });
  const haloOpacity = loop.interpolate({
    inputRange: [0, 0.04, 0.09, 0.66, 0.74, 1],
    outputRange: [0, 0, 0.85, 0.85, 0, 0],
  });
  const chevRightOpacity = loop.interpolate({
    inputRange: [0, 0.07, 0.14, 0.32, 0.4, 1],
    outputRange: [0.3, 0.3, 1, 1, 0.3, 0.3],
  });
  const chevLeftOpacity = loop.interpolate({
    inputRange: [0, 0.34, 0.44, 0.62, 0.7, 1],
    outputRange: [0.3, 0.3, 1, 1, 0.3, 0.3],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} pointerEvents="box-none">
      {/* Rect-based spotlight: everything except the control zone is dimmed. */}
      <View pointerEvents="none" style={[styles.dim, styles.dimTop, { height: rect.top }]} />
      <View pointerEvents="none" style={[styles.dim, styles.dimBottom, { top: rect.top + rect.height }]} />
      <View
        pointerEvents="none"
        style={[styles.dim, styles.dimLeft, { top: rect.top, width: rect.left, height: rect.height }]}
      />
      <View
        pointerEvents="none"
        style={[styles.dim, styles.dimRight, { left: rect.left + rect.width, top: rect.top, height: rect.height }]}
      />
      <View pointerEvents="none" style={[styles.zoneEdge, rect]} />

      {/* Ghost joystick, centred on the declared zone. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.stick, { left: cx - C, top: cy - C, transform: [{ scale: pop }] }]}
      >
        <View style={styles.ring} />
        <Chevron top={12} left={C - 10} rotate="0deg" opacity={0.3} />
        <Chevron top={WRAP - 21} left={C - 10} rotate="180deg" opacity={0.3} />
        <AnimatedChevron top={C - 4.5} left={12} rotate="-90deg" opacity={chevLeftOpacity} />
        <AnimatedChevron top={C - 4.5} left={WRAP - 32} rotate="90deg" opacity={chevRightOpacity} />
        <Animated.View style={[styles.knobGroup, { transform: [{ translateX: knobX }] }]}>
          <View style={styles.knob} />
          <View style={styles.handWrap}>
            <Animated.View style={[styles.halo, { opacity: haloOpacity }]} />
            <TutorialHand />
          </View>
        </Animated.View>
      </Animated.View>

      {/* One-line instruction above the zone; a quiet dismiss below the stick. */}
      <View pointerEvents="box-none" style={[styles.labelRow, { top: labelTop }]}>
        <View style={styles.labelPill}>
          <Text style={styles.labelText} allowFontScaling={false}>
            {t('tutJoystickHint')}
          </Text>
        </View>
      </View>
      <View pointerEvents="box-none" style={[styles.labelRow, { top: gotItTop }]}>
        <Pressable
          onPress={onGotIt}
          hitSlop={10}
          style={({ pressed }) => [styles.gotIt, pressed && styles.gotItPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('gotIt')}
        >
          <Text style={styles.gotItText} allowFontScaling={false}>
            {t('gotIt')}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

function Chevron({ top, left, rotate, opacity }: { top: number; left: number; rotate: string; opacity: number }) {
  return (
    <View style={[styles.chevron, { top, left, opacity, transform: [{ rotate }] }]}>
      <View style={[styles.chevBar, styles.chevBarLeft]} />
      <View style={[styles.chevBar, styles.chevBarRight]} />
    </View>
  );
}

function AnimatedChevron({
  top,
  left,
  rotate,
  opacity,
}: {
  top: number;
  left: number;
  rotate: string;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View style={[styles.chevron, { top, left, opacity, transform: [{ rotate }] }]}>
      <View style={[styles.chevBar, styles.chevBarLeft]} />
      <View style={[styles.chevBar, styles.chevBarRight]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 30 },
  dim: { position: 'absolute', backgroundColor: 'rgba(6, 11, 25, 0.5)' },
  dimTop: { left: 0, top: 0, right: 0 },
  dimBottom: { left: 0, right: 0, bottom: 0 },
  dimLeft: { left: 0 },
  dimRight: { right: 0 },
  zoneEdge: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(191, 227, 255, 0.30)',
  },

  stick: { position: 'absolute', width: WRAP, height: WRAP },
  ring: {
    position: 'absolute',
    left: C - RING / 2,
    top: C - RING / 2,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: 'rgba(191, 227, 255, 0.55)',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  knobGroup: { position: 'absolute', left: 0, top: 0, width: WRAP, height: WRAP },
  knob: {
    position: 'absolute',
    left: C - KNOB / 2,
    top: C - KNOB / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  handWrap: { position: 'absolute', left: C - HAND_TIP.x, top: C - HAND_TIP.y },
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

  chevron: { position: 'absolute', width: 20, height: 9 },
  chevBar: { position: 'absolute', top: 3, width: 12, height: 3, borderRadius: 1.5, backgroundColor: HUD.muted },
  chevBarLeft: { left: 0, transform: [{ rotate: '-34deg' }] },
  chevBarRight: { right: 0, transform: [{ rotate: '34deg' }] },

  labelRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  labelPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: GLASS.handle.fill,
    borderWidth: 1,
    borderColor: GLASS.handle.border,
  },
  labelText: { color: HUD.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },

  gotIt: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  gotItPressed: { opacity: 0.7 },
  gotItText: { color: 'rgba(248, 250, 252, 0.9)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
});
