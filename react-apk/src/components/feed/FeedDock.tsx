import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { FEED } from '../../config/env';
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
 * The floating glass dock from activity_main.xml (`bottomNavBar` +
 * `bottomBarToggleHandle`): All Games / Like / Favorites / Settings over the
 * game, with the ⌃/⌄ pill that slides the bar in and out. Movement is a pure
 * translateY on the native driver, so showing or hiding the bar never
 * re-lays-out the WebView — the same "zero WebView shift" rule as
 * MainActivity.toggleBottomBar.
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
  const barY = useRef(new Animated.Value(0)).current;
  const handleY = useRef(new Animated.Value(-(BAR_HEIGHT + HANDLE_GAP))).current;
  const first = useRef(true);

  useEffect(() => {
    const targetBar = visible ? 0 : BAR_HEIGHT + HIDE_EXTRA + insetBottom;
    const targetHandle = visible ? -(BAR_HEIGHT + HANDLE_GAP) : 0;
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
  }, [visible, insetBottom, barY, handleY]);

  const glass = theme.isDark ? GLASS.dock.dark : GLASS.dock.light;
  const inactive = theme.isDark ? GLASS.navInactive.dark : GLASS.navInactive.light;
  const allColor = tab === 'all' ? theme.accent : inactive;
  const favColor = tab === 'favorites' ? theme.accent : inactive;
  const likeColor = isFavorite ? HUD.heart : inactive;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Animated.View
        style={[
          styles.bar,
          { bottom: insetBottom, backgroundColor: glass.fill, borderColor: glass.border, transform: [{ translateY: barY }] },
        ]}
      >
        <View pointerEvents="none" style={[styles.sheen, { backgroundColor: glass.sheen }]} />
        <DockItem label="All Games" color={allColor} onPress={onAllGames} accessibilityLabel="All games">
          <GamepadIcon size={22} color={allColor} />
        </DockItem>
        <DockItem label="Like" color={likeColor} onPress={onLike} accessibilityLabel="Like current game">
          <HeartIcon size={24} color={likeColor} filled={isFavorite} />
        </DockItem>
        <DockItem label="Favorites" color={favColor} onPress={onFavorites} accessibilityLabel="Favorites">
          <StarIcon size={22} color={favColor} />
        </DockItem>
        <DockItem label="Settings" color={inactive} onPress={onSettings} accessibilityLabel="Settings">
          <GearIcon size={22} color={inactive} />
        </DockItem>
      </Animated.View>

      <Animated.View style={[styles.handleWrap, { bottom: insetBottom + HANDLE_GAP, transform: [{ translateY: handleY }] }]}>
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
      <Text style={[styles.itemLabel, { color }]} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
  },
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: BAR_HEIGHT,
    borderRadius: 30,
    borderWidth: 1,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 16,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 2,
    bottom: 38,
    borderRadius: 22,
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: { opacity: 0.7 },
  itemLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  handleWrap: {
    position: 'absolute',
    alignSelf: 'center',
    elevation: 20,
  },
  handle: {
    width: 56,
    height: 24,
    borderRadius: 12,
    backgroundColor: GLASS.handle.fill,
    borderWidth: 1,
    borderColor: GLASS.handle.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
    includeFontPadding: false,
  },
});
