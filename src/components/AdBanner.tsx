import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {BannerAd, BannerAdSize, TestIds} from 'react-native-google-mobile-ads';

interface AdBannerProps {
  // Use a real Ad Unit ID here, or fallback to TestIds.BANNER for testing
  adUnitId?: string;
}

export default function AdBanner({adUnitId = TestIds.BANNER}: AdBannerProps) {
  const [isAdLoaded, setIsAdLoaded] = useState(false);

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setIsAdLoaded(true);
        }}
        onAdFailedToLoad={error => {
          console.error('Ad failed to load: ', error);
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
    paddingVertical: 10,
    width: '100%',
  },
});
