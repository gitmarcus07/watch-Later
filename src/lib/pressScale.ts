import { useCallback, useState } from 'react';
import { Animated } from 'react-native';

/**
 * Minimal tactile press animation for tappable controls: the content springs
 * down to `activeScale` while the finger is down and back on release.
 * Uses the core Animated API (not Reanimated) so it also animates inside the
 * Jest renderer. Disabled controls never fire press events, so they stay
 * still.
 */
export function usePressScale(activeScale = 0.96) {
  const [scale] = useState(() => new Animated.Value(1));
  const pressIn = useCallback(() => {
    Animated.spring(scale, { toValue: activeScale, damping: 18, stiffness: 500, useNativeDriver: true }).start();
  }, [scale, activeScale]);
  const pressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 420, useNativeDriver: true }).start();
  }, [scale]);
  return { pressScaleStyle: { transform: [{ scale }] } as const, pressIn, pressOut };
}
