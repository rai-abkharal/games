import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '../../theme/themes';
import { useTranslation } from '../../i18n/translations';

const APP_LOGO_IMAGE = require('../../assets/images/app_logo.png');

interface Props {
  theme: ThemeColors;
  isFavoritesTab: boolean;
  onBrowseAll: () => void;
  onRestartFeed: () => void;
}

export function BrowseAllGamesPage({
  theme,
  isFavoritesTab,
  onBrowseAll,
  onRestartFeed,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 64 }]}>
      <View style={styles.centerCard}>
        {/* Luminous Logo with Ambient Halo */}
        <View style={styles.logoWrapper}>
          <View style={styles.logoHalo} />
          <View style={styles.outerRing} />
          <Image source={APP_LOGO_IMAGE} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: theme.textPrimary }]} allowFontScaling={false}>
          {isFavoritesTab
            ? t('endOfFavoritesTitle') || 'End of Favorites'
            : t('browseAllGames') || 'Browse All Games'}
        </Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} allowFontScaling={false}>
          {isFavoritesTab
            ? t('endOfFavoritesSub') || 'Explore our full collection of instant arcade games'
            : "You've swiped through the catalogue! Tap below to start over."}
        </Text>

        {/* Primary Action Button */}
        <Pressable
          onPress={isFavoritesTab ? onBrowseAll : onRestartFeed}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: theme.accent,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isFavoritesTab ? 'Browse All Games' : 'Start from Beginning'}
        >
          <Text style={styles.actionButtonText} allowFontScaling={false}>
            {isFavoritesTab
              ? (t('browseAllGames') || 'Browse All Games') + ' →'
              : 'Start from Beginning ↺'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  centerCard: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 360,
    width: '100%',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    position: 'relative',
  },
  logoHalo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
  },
  outerRing: {
    position: 'absolute',
    width: 114,
    height: 114,
    borderRadius: 57,
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    borderStyle: 'dashed',
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  actionButton: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
