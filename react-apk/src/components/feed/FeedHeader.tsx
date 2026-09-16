import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePlayerStore } from '../../store/playerStore';
import { GLASS, HUD, type ThemeColors } from '../../theme/themes';
import { AdBanner } from '../AdBanner';

interface Props {
  theme: ThemeColors;
  insetTop: number;
  bannerEnabled: boolean;
  /** Active game title shown on the right */
  title: string;
}

/**
 * The sleek native top bar:
 * - Direct seamless placement right below the status bar (no extra top gaps)
 * - Borderless Ad Banner blending into the header glass background
 * - Minimal row below banner: Guest name on left (coins removed), Game name on right (count removed)
 * - Max space preserved for the game stage
 */
export const FeedHeader = memo(function FeedHeaderInner({
  theme,
  insetTop,
  bannerEnabled,
  title,
}: Props) {
  const playerId = usePlayerStore(state => state.playerId);
  const glass = theme.isDark ? GLASS.topBar.dark : GLASS.topBar.light;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          backgroundColor: insetTop > 0 ? theme.bg : 'transparent',
          paddingTop: insetTop,
        },
      ]}
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.glass,
          { backgroundColor: glass.fill, borderColor: glass.border },
        ]}
      >
        <View pointerEvents="none" style={[styles.sheen, { backgroundColor: glass.sheen }]} />
        
        {/* Ad Banner: Borderless, blending seamlessly into header background */}
        <View pointerEvents="box-none" style={styles.bannerSlot}>
          {bannerEnabled ? <AdBanner /> : null}
        </View>

        {/* Minimal info row: Left = Guest name (no coins), Right = Game name (no count/category) */}
        <View style={styles.row} pointerEvents="box-none">
          <Text numberOfLines={1} style={styles.player}>
            {playerId || 'Guest'}
          </Text>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    zIndex: 2,
    elevation: 20,
  },
  glass: {
    paddingTop: 2,
    paddingBottom: 5,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderTopWidth: 0,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    bottom: 24,
    borderRadius: 14,
  },
  bannerSlot: {
    height: 50,
    width: '100%',
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 0, // Border removed as requested
    backgroundColor: 'transparent', // Matches header background color
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 2,
    minHeight: 22,
  },
  player: {
    color: HUD.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
    maxWidth: '45%',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  title: {
    color: HUD.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
    maxWidth: '45%',
    letterSpacing: 0.2,
  },
});
