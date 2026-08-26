import {useEffect, useState, useRef} from 'react';
import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

export const REAL_INTERSTITIAL_ID = 'ca-app-pub-5278018921408798/9478834492';

// In DEV, use Google's official Test ID so interstitial ads trigger immediately.
// In Production builds, it automatically uses your real Ad Unit ID.
export const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : REAL_INTERSTITIAL_ID;

export function useInterstitialAd() {
  const [isLoaded, setIsLoaded] = useState(false);
  const adRef = useRef<InterstitialAd | null>(null);

  useEffect(() => {
    let isMounted = true;

    try {
      const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: true,
      });
      adRef.current = ad;

      const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
        if (isMounted) {
          setIsLoaded(true);
        }
      });

      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        if (isMounted) {
          setIsLoaded(false);
        }
        // Preload next ad
        try {
          ad.load();
        } catch {
          // ignore
        }
      });

      const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
        if (isMounted) {
          setIsLoaded(false);
        }
      });

      // Safely load inside React lifecycle
      ad.load();

      return () => {
        isMounted = false;
        unsubLoaded();
        unsubClosed();
        unsubError();
      };
    } catch (e) {
      console.log('AdMob: Interstitial hook notice:', e);
    }
  }, []);

  const showInterstitialIfAvailable = () => {
    try {
      if (isLoaded && adRef.current) {
        adRef.current.show();
      } else if (adRef.current) {
        adRef.current.load();
      }
    } catch (e) {
      console.log('AdMob: Interstitial show notice:', e);
    }
  };

  return {
    showInterstitialIfAvailable,
    isLoaded,
  };
}
