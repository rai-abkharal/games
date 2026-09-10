import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GLASS, HUD, type ThemeColors } from '../../theme/themes';
import { AdBanner } from '../AdBanner';

interface Props {
  theme: ThemeColors;
  insetTop: number;
  bannerEnabled: boolean;
  playerId: string;
  coins: number;
  title: string;
  meta: string;
  highScore: number;
}

/**
 * The native top bar (activity_main.xml `topBar`): a glass strip with
 * bottom-rounded corners sitting on the theme background above the pager —
 * banner slot, player name + coins pill on the left, game title + "n of N •
 * category" right-aligned, and the gold high-score pill.
 */
export const FeedHeader = memo(function FeedHeaderInner({
  theme,
  insetTop,
  bannerEnabled,
  playerId,
  coins,
  title,
  meta,
  highScore,
}: Props) {
  const glass = theme.isDark ? GLASS.topBar.dark : GLASS.topBar.light;
  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insetTop }]}>
      <View style={[styles.glass, { backgroundColor: glass.fill, borderColor: glass.border }]}>
        <View pointerEvents="none" style={[styles.sheen, { backgroundColor: glass.sheen }]} />
        {bannerEnabled ? (
          <View style={[styles.bannerSlot, theme.isDark ? styles.bannerSlotDark : styles.bannerSlotLight]}>
            <AdBanner />
          </View>
        ) : null}
        <View style={styles.row}>
          <View style={styles.profile}>
            <Text numberOfLines={1} style={styles.player}>
              {playerId}
            </Text>
            <Text style={styles.coinsPill}>🪙 {coins}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          </View>
          {highScore > 0 ? <Text style={styles.bestPill}>🏆 {highScore}</Text> : null}
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
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderTopWidth: 0,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 2,
    bottom: 40,
    borderRadius: 16,
  },
  bannerSlot: {
    height: 50,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(191, 227, 255, 0.43)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerSlotDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.32)',
  },
  bannerSlotLight: {
    backgroundColor: 'rgba(241, 245, 249, 0.25)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '48%',
  },
  player: {
    color: HUD.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  coinsPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: GLASS.coinsPill.fill,
    borderColor: GLASS.coinsPill.border,
    color: GLASS.coinsPill.text,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    color: HUD.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: HUD.muted,
    fontSize: 11,
  },
  bestPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: GLASS.bestPill.fill,
    borderColor: GLASS.bestPill.border,
    color: GLASS.bestPill.text,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
