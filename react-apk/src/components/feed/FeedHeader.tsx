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
          {/* Bottom-Left: App Logo (Lightly Rounded) + Two-line "EiBi Games" brand lockup */}
          <View style={styles.brandLockup} pointerEvents="none">
            <View style={styles.logoWrap}>
              <Image
                source={APP_LOGO_IMAGE}
                style={styles.appLogo}
                resizeMode="cover"
              />
            </View>
            <View style={styles.brandTextCol}>
              <Text style={styles.brandNameLine1} allowFontScaling={false}>
                EiBi
              </Text>
              <Text style={styles.brandNameLine2} allowFontScaling={false}>
                Games
              </Text>
            </View>
          </View>

          {/* Right: Active Game Name in bold black */}
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
    borderWidth: 0,
  },
  container: {
    backgroundColor: '#FFFFFF',
    paddingTop: 3,
    paddingBottom: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
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
  logoWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  appLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  brandTextCol: {
    marginLeft: 6,
    justifyContent: 'center',
  },
  brandNameLine1: {
    fontSize: 13.5,
    lineHeight: 15.5,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 0.4,
  },
  brandNameLine2: {
    fontSize: 11,
    lineHeight: 12.5,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3,
  },
  gameTitleWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  gameTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'right',
  },
});
