import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * A flat, view-drawn pointing hand for the coach marks — same technique as
 * NavIcons, which draws the dock icons from plain views so no emoji, image or
 * SVG dependency is needed. The fingertip is the contact point and sits at
 * (TIP.x, TIP.y) inside the component box, so a parent can align it exactly
 * with whatever the hand is "touching".
 */

const SKIN = '#F8FAFC';
const EDGE = 'rgba(15, 23, 42, 0.16)';
const CREASE = 'rgba(15, 23, 42, 0.12)';

export const HAND_TIP = { x: 15, y: 2 } as const;
export const HAND_SIZE = { width: 48, height: 58 } as const;

export const TutorialHand = memo(function TutorialHandInner() {
  return (
    <View style={styles.box} pointerEvents="none">
      <View style={styles.finger} />
      <View style={styles.fist} />
      <View style={styles.creaseA} />
      <View style={styles.creaseB} />
      <View style={styles.thumb} />
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    width: HAND_SIZE.width,
    height: HAND_SIZE.height,
    transform: [{ rotate: '-8deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  finger: {
    position: 'absolute',
    left: 8,
    top: 0,
    width: 14,
    height: 34,
    borderRadius: 7,
    backgroundColor: SKIN,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
  },
  fist: {
    position: 'absolute',
    left: 1,
    top: 26,
    width: 35,
    height: 30,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 17,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 17,
    backgroundColor: SKIN,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
  },
  /** Folded-finger creases — the detail that stops the fist reading as a blob. */
  creaseA: {
    position: 'absolute',
    left: 15,
    top: 29,
    width: 2,
    height: 9,
    borderRadius: 1,
    backgroundColor: CREASE,
  },
  creaseB: {
    position: 'absolute',
    left: 23,
    top: 29,
    width: 2,
    height: 9,
    borderRadius: 1,
    backgroundColor: CREASE,
  },
  thumb: {
    position: 'absolute',
    left: 30,
    top: 24,
    width: 12,
    height: 21,
    borderRadius: 6,
    backgroundColor: SKIN,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
    transform: [{ rotate: '-38deg' }],
  },
});
