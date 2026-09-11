import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useAdsStore } from '../services/adManager';

/**
 * Banner controlled by the Admin Panel `bannerEnabled` flag. The header
 * reserves the native app's fixed 50 dp slot whenever banners are enabled, so
 * a late fill never resizes the game underneath; until an ad has loaded the
 * slot stays empty and untouchable.
 */
export function AdBanner() {
  const enabled = useAdsStore(state => state.bannerEnabled);
  const unitId = useAdsStore(state => state.bannerUnitId);
  const [loaded, setLoaded] = useState(false);
  if (!enabled) return null;
  return (
    <View style={[styles.wrap, !loaded && styles.hidden]} pointerEvents={loaded ? 'auto' : 'none'}>
      <BannerAd
        key={unitId}
        unitId={unitId}
        size={BannerAdSize.BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 50, width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hidden: { opacity: 0 },
});
