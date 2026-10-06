import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

interface FadeInViewProps {
  style?: StyleProp<ViewStyle>;
  delay?: number;
  distance?: number;
}

/**
 * Subtle entrance animation, consistent with the welcome screen.
 * Instant when the user prefers reduced motion. Never used on list rows.
 */
export function FadeInView({ children, style, delay = 0, distance = 10 }: PropsWithChildren<FadeInViewProps>) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <View style={style}>{children}</View>;
  return (
    <Animated.View entering={FadeInDown.duration(180).delay(delay).withInitialValues({ transform: [{ translateY: distance }] })} style={style}>
      {children}
    </Animated.View>
  );
}
