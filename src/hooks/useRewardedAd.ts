import {useEffect, useState, useRef} from 'react';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';

const adUnitId = 'ca-app-pub-5278018921408798/9129631506';

const rewarded = RewardedAd.createForAdRequest(adUnitId, {
  requestNonPersonalizedAdsOnly: true,
});

export function useRewardedAd() {
  const [loaded, setLoaded] = useState(false);
  const onRewardEarned = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeLoaded = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        setLoaded(true);
      },
    );

    const unsubscribeEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        if (onRewardEarned.current) {
          onRewardEarned.current();
          onRewardEarned.current = null;
        }
      },
    );

    const unsubscribeClosed = rewarded.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setLoaded(false);
        // Preload next ad
        rewarded.load();

        // If closed, ensure any pending action executes
        if (onRewardEarned.current) {
          onRewardEarned.current();
          onRewardEarned.current = null;
        }
      },
    );

    const unsubscribeError = rewarded.addAdEventListener(
      AdEventType.ERROR,
      () => {
        setLoaded(false);
        if (onRewardEarned.current) {
          onRewardEarned.current();
          onRewardEarned.current = null;
        }
      },
    );

    // Initial load
    rewarded.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
    };
  }, []);

  const showAdIfAvailable = (onComplete: () => void) => {
    if (loaded) {
      onRewardEarned.current = onComplete;
      rewarded.show();
    } else {
      // If ad is not ready yet, execute immediately and attempt a load in background
      rewarded.load();
      onComplete();
    }
  };

  return {showAdIfAvailable, loaded};
}

