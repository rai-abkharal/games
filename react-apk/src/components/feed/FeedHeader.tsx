import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePlayerStore } from '../../store/playerStore';
import { GLASS, HUD, type ThemeColors } from '../../theme/themes';
import { AdBanner } from '../AdBanner';

interface Props {
  theme: ThemeColors;
  insetTop: number;
  bannerEnabled: boolean;
  /** Game on screen, for its best score. */
  gameId: string | null;
  title: string;
  meta: string;
}

/**
 * The native top bar (activity_main.xml `topBar`): a glass strip with
 * bottom-rounded corners sitting on the theme background above the pager —
 * banner slot, player name + coins pill on the left, game title + "n of N •
 * category" right-aligned, and the gold high-score pill.
 *
 * Player name, coins and best score are read from the store here rather
 * than passed down, so a coin update during play re-renders this header
 * only — not the feed screen and its pager.
 */
export const FeedHeader = memo(function FeedHeaderInner({ theme, insetTop, bannerEnabled, gameId, title, meta }: Props) {
  const playerId = usePlayerStore(state => state.playerId);
  const coins = usePlayerStore(state => state.coins);
  const highScore = usePlayerStore(state => (gameId ? state.highScores[gameId] ?? 0 : 0));
  const glass = theme.isDark ? GLASS.topBar.dark : GLASS.topBar.light;
  const bannerThemeStyle = theme.isDark
    ? styles.bannerSlotDark
    : theme.id === 'off_white'
    ? styles.bannerSlotWarm
    : styles.bannerSlotLight;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { backgroundColor: insetTop > 0 ? theme.bg : 'transparent', paddingTop: insetTop }]}
    >
      <View
        pointerEvents="box-none"
        style={[styles.glass, { backgroundColor: glass.fill, borderColor: glass.border }]}
      >
        <View pointerEvents="none" style={[styles.sheen, { backgroundColor: glass.sheen }]} />
        <View
          pointerEvents="box-none"
          style={[styles.bannerSlot, bannerThemeStyle]}
        >
          {bannerEnabled ? <AdBanner /> : null}
        </View>
        <View style={styles.row} pointerEvents="box-none">
          <View style={styles.profile} pointerEvents="box-none">
            <Text numberOfLines={1} style={styles.player}>
              {playerId}
            </Text>
            <Text style={styles.coinsPill}>🪙 {coins}</Text>
          </View>
          <View style={styles.titleBlock} pointerEvents="box-none">
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
    width: '100%',
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
  bannerSlotWarm: {
    backgroundColor: 'rgba(234, 230, 222, 0.25)',
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
