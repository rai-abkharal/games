import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEED } from '../../config/env';
import { useTranslation } from '../../i18n/translations';
import { GLASS, HUD, type ThemeColors } from '../../theme/themes';
import { GamepadIcon, GearIcon, HeartIcon, StarIcon } from './NavIcons';

export type FeedTab = 'all' | 'favorites';

interface Props {
  theme: ThemeColors;
  visible: boolean;
  tab: FeedTab;
  isFavorite: boolean;
  insetBottom: number;
  onAllGames: () => void;
  onLike: () => void;
  onFavorites: () => void;
  onSettings: () => void;
  onToggle: () => void;
}

const BAR_HEIGHT = 56;
const HANDLE_GAP = 6;
const HIDE_EXTRA = 40;

/**
 * The bottom dock:
 * - Fully responsive: never clips Like/Favorite buttons on small or wide screens
 * - Clean safe-area inset protection for Android gesture bars & iOS indicators
 * - Centered max-width container for tablet / wide displays
 * - Hide/show toggle arrow located on the RIGHT side
 */
export const FeedDock = memo(function FeedDockInner({
  theme,
  visible,
  tab,
  isFavorite,
  insetBottom,
  onAllGames,
  onLike,
  onFavorites,
  onSettings,
  onToggle,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const effectiveBottom = Math.max(insets?.bottom ?? 0, insetBottom);
  const totalBarHeight = BAR_HEIGHT + effectiveBottom;

  const barY = useRef(new Animated.Value(0)).current;
  const handleY = useRef(new Animated.Value(-(totalBarHeight + HANDLE_GAP))).current;
  const first = useRef(true);

  useEffect(() => {
    const targetBar = visible ? 0 : totalBarHeight + HIDE_EXTRA;
    const targetHandle = visible ? -(totalBarHeight + HANDLE_GAP) : 0;
    if (first.current) {
      first.current = false;
      barY.setValue(targetBar);
      handleY.setValue(targetHandle);
      return;
    }
    const easing = Easing.out(Easing.quad);
    const animation = Animated.parallel([
      Animated.timing(barY, { toValue: targetBar, duration: FEED.dockAnimationMs, easing, useNativeDriver: true }),
      Animated.timing(handleY, { toValue: targetHandle, duration: FEED.dockAnimationMs, easing, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, totalBarHeight, barY, handleY]);

  const glass = theme.isDark ? GLASS.dock.dark : GLASS.dock.light;
  const inactive = theme.isDark ? GLASS.navInactive.dark : GLASS.navInactive.light;
  const allColor = tab === 'all' ? theme.accent : inactive;
  const favColor = tab === 'favorites' ? theme.accent : inactive;
  const likeColor = isFavorite ? HUD.heart : inactive;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      {/* Edge-to-edge dock bar with safe-area padding and centered inner container */}
      <Animated.View
        style={[
          styles.bar,
          {
            height: totalBarHeight,
            paddingBottom: effectiveBottom,
            backgroundColor: glass.fill,
            borderColor: glass.border,
            transform: [{ translateY: barY }],
          },
        ]}
      >
        <View pointerEvents="none" style={[styles.sheen, { backgroundColor: glass.sheen }]} />
        <View style={styles.barInner}>
          <DockItem label={t('allGames')} color={allColor} onPress={onAllGames} accessibilityLabel="All games">
            <GamepadIcon size={22} color={allColor} />
          </DockItem>
          <DockItem label="Like" color={likeColor} onPress={onLike} accessibilityLabel="Like current game">
            <HeartIcon size={22} color={likeColor} filled={isFavorite} />
          </DockItem>
          <DockItem label={t('favorites')} color={favColor} onPress={onFavorites} accessibilityLabel="Favorites">
            <StarIcon size={22} color={favColor} />
          </DockItem>
          <DockItem label={t('settingsTitle')} color={inactive} onPress={onSettings} accessibilityLabel="Settings">
            <GearIcon size={22} color={inactive} />
          </DockItem>
        </View>
      </Animated.View>

      {/* Hide/Show Toggle Button positioned on the RIGHT side */}
      <Animated.View
        style={[
          styles.handleWrap,
          {
            bottom: HANDLE_GAP,
            transform: [{ translateY: handleY }],
          },
        ]}
      >
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          style={styles.handle}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide controls' : 'Show controls'}
        >
          <Text style={styles.handleText} allowFontScaling={false}>
            {visible ? '⌄' : '⌃'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
});

function DockItem({
  label,
  color,
  onPress,
  accessibilityLabel,
  children,
}: {
  label: string;
  color: string;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      <Text style={[styles.itemLabel, { color }]} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  // Straight dock bar matching the phone edges from left to right (no rounded corners)
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
    borderTopWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    elevation: 16,
    overflow: 'hidden',
  },
  barInner: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: BAR_HEIGHT,
    alignSelf: 'center',
    paddingHorizontal: 6,
  },
  sheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 38,
    borderRadius: 0,
  },
  item: {
    flex: 1,
    minWidth: 54,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  itemPressed: { opacity: 0.7 },
  itemLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  // Toggle Arrow placed on the RIGHT side
  handleWrap: {
    position: 'absolute',
    right: 18,
    elevation: 20,
  },
  handle: {
    width: 52,
    height: 24,
    borderRadius: 12,
    backgroundColor: GLASS.handle.fill,
    borderWidth: 1,
    borderColor: GLASS.handle.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  handleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
    includeFontPadding: false,
  },
});
