import React, { useEffect, useRef, useState } from 'react';
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
  const sdkReady = useAdsStore(state => state.sdkReady);
  const reloadKey = useAdsStore(state => state.bannerReloadKey);
  const [loaded, setLoaded] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, [unitId, reloadKey, sdkReady]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  if (!enabled || !unitId || !sdkReady) return null;

  return (
    <View style={[styles.wrap, !loaded && styles.hidden]} pointerEvents={loaded ? 'auto' : 'none'}>
      <BannerAd
        key={`${unitId}-${reloadKey}`}
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          setLoaded(true);
        }}
        onAdFailedToLoad={error => {
          console.warn('[AdBanner] Banner failed to load:', error?.message || error);
          setLoaded(false);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            useAdsStore.setState(s => ({ bannerReloadKey: s.bannerReloadKey + 1 }));
          }, 15_000);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 50,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hidden: {
    opacity: 0,
    height: 0,
    minHeight: 0,
  },
});
