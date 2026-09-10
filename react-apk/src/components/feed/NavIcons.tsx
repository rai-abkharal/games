import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Tintable stand-ins for the native vector drawables (ic_gamepad, ic_heart,
 * ic_star, ic_settings). Drawn with plain views and monochrome text glyphs so
 * active/inactive tints work without an icon or SVG dependency.
 */

interface IconProps {
  size: number;
  color: string;
}

const CUTOUT = '#070D1E';
const GEAR_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export const GamepadIcon = memo(function GamepadIconInner({ size, color }: IconProps) {
  const bodyH = size * 0.58;
  const bar = Math.max(2, Math.round(size * 0.1));
  const dot = Math.max(3, Math.round(size * 0.14));
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={[styles.padBody, { width: size, height: bodyH, borderRadius: size * 0.2, backgroundColor: color }]}>
        <View style={[styles.cutout, { left: size * 0.16, top: bodyH / 2 - bar / 2, width: size * 0.3, height: bar }]} />
        <View style={[styles.cutout, { left: size * 0.31 - bar / 2, top: bodyH / 2 - size * 0.15, width: bar, height: size * 0.3 }]} />
        <View style={[styles.cutout, { right: size * 0.28, top: bodyH * 0.55 - dot / 2, width: dot, height: dot, borderRadius: dot / 2 }]} />
        <View style={[styles.cutout, { right: size * 0.12, top: bodyH * 0.32 - dot / 2, width: dot, height: dot, borderRadius: dot / 2 }]} />
      </View>
    </View>
  );
});

export const HeartIcon = memo(function HeartIconInner({ size, color, filled }: IconProps & { filled: boolean }) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Text style={[styles.glyph, { color, fontSize: size * 0.95, lineHeight: size * 1.05 }]} allowFontScaling={false}>
        {filled ? '♥' : '♡'}
      </Text>
    </View>
  );
});

export const StarIcon = memo(function StarIconInner({ size, color }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Text style={[styles.glyph, { color, fontSize: size * 1.05, lineHeight: size * 1.15 }]} allowFontScaling={false}>
        {'★'}
      </Text>
    </View>
  );
});

export const GearIcon = memo(function GearIconInner({ size, color }: IconProps) {
  const toothW = size * 0.24;
  const toothH = size * 0.22;
  const ring = size * 0.72;
  const ringWidth = size * 0.17;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {GEAR_ANGLES.map(angle => (
        <View
          key={angle}
          style={[
            styles.tooth,
            {
              left: size / 2 - toothW / 2,
              top: size / 2 - toothH / 2,
              width: toothW,
              height: toothH,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }, { translateY: -size * 0.39 }],
            },
          ]}
        />
      ))}
      <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: ringWidth, borderColor: color }} />
    </View>
  );
});

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  padBody: { justifyContent: 'center' },
  cutout: { position: 'absolute', backgroundColor: CUTOUT, opacity: 0.85 },
  glyph: { includeFontPadding: false },
  tooth: { position: 'absolute', borderRadius: 2 },
});
