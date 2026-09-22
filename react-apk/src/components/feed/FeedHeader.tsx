import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { type ThemeColors } from '../../theme/themes';
import { AdBanner } from '../AdBanner';

const APP_LOGO_IMAGE = require('../../assets/images/app_logo.png');

interface Props {
  theme: ThemeColors;
  insetTop: number;
  bannerEnabled: boolean;
  /** Active game title */
  title: string;
}

/**
 * Clean White & Purple Native App Bar (Option 3):
 * - Pure white container (#FFFFFF) with subtle soft lavender bottom border
 * - Borderless Ad Banner slot at the top (seamlessly embedded)
 * - Bottom-left: Compact App Logo (28x28) + Two-line "EiBi Games" brand lockup
 *   (carefully sized so the text height does not exceed the logo)
 * - Right: Active Game Name in bold purple text (#7C3AED), taking all remaining space
 *   with truncation protection (ellipsizeMode="tail") to prevent collision
 */
export const FeedHeader = memo(function FeedHeaderInner({
  insetTop,
  bannerEnabled,
  title,
}: Props) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          backgroundColor: '#FFFFFF',
          paddingTop: insetTop,
        },
      ]}
    >
      {/* Full-Width Adaptive Ad Banner: Spans edge-to-edge with no left/right margins */}
      {bannerEnabled ? (
        <View pointerEvents="box-none" style={styles.bannerSlot}>
          <AdBanner />
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.container}>
        {/* Info Row: Brand on bottom-left, Game Name on right */}
        <View style={styles.contentRow} pointerEvents="box-none">
          {/* Bottom-Left: App Logo + Two-line "EiBi Games" brand lockup */}
          <View style={styles.brandLockup} pointerEvents="none">
            <Image
              source={APP_LOGO_IMAGE}
              style={styles.appLogo}
              resizeMode="contain"
            />
            <View style={styles.brandTextCol}>
              <Text style={styles.brandNameLine1} allowFontScaling={false}>
                EiBi
              </Text>
              <Text style={styles.brandNameLine2} allowFontScaling={false}>
                GAMES
              </Text>
            </View>
          </View>

          {/* Right: Active Game Name in vibrant purple */}
          <View style={styles.gameTitleWrap} pointerEvents="box-none">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.gameTitle}
              allowFontScaling={false}
            >
              {title}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    zIndex: 2,
    elevation: 20,
    backgroundColor: '#FFFFFF',
  },
  bannerSlot: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    paddingTop: 3,
    paddingBottom: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    width: '100%',
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  appLogo: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  brandTextCol: {
    marginLeft: 6,
    justifyContent: 'center',
  },
  brandNameLine1: {
    fontSize: 13.5,
    lineHeight: 15.5,
    fontWeight: '900',
    color: '#6B21A8',
    letterSpacing: 0.4,
  },
  brandNameLine2: {
    fontSize: 11,
    lineHeight: 12.5,
    fontWeight: '800',
    color: '#9333EA',
    letterSpacing: 1.2,
  },
  gameTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  gameTitle: {
    color: '#7C3AED',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'right',
  },
});
