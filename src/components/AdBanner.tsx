import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize, TestIds} from 'react-native-google-mobile-ads';

export const REAL_BANNER_ID = 'ca-app-pub-5278018921408798/8223743946';

interface AdBannerProps {
  adUnitId?: string;
}

export default function AdBanner({adUnitId}: AdBannerProps) {
  const [isAdLoaded, setIsAdLoaded] = useState(false);

  // In development mode (__DEV__), use Google's official Test ID so banners show up immediately.
  // In release / production builds, use your real AdMob unit ID.
  const activeUnitId = __DEV__ ? TestIds.BANNER : (adUnitId || REAL_BANNER_ID);

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={activeUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setIsAdLoaded(true);
        }}
        onAdFailedToLoad={error => {
          console.log('AdMob banner note:', error?.message);
          setIsAdLoaded(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 50,
    marginVertical: 6,
  },
});
