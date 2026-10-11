import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

interface FadeInViewProps {
  style?: StyleProp<ViewStyle>;
  delay?: number;
  distance?: number;
}

// Lazy-load Reanimated so the Jest renderer (no native worklets module)
// falls back to a plain View instead of crashing on import.
type AnyRecord = Record<string, any>;

let animatedView: AnyRecord | undefined;
let fadeInDown: AnyRecord | undefined;
let useReducedMotionHook: (() => boolean | null | undefined) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-reanimated') as AnyRecord;
  animatedView = mod?.default?.View ?? mod?.View;
  fadeInDown = mod?.FadeInDown;
  useReducedMotionHook = mod?.useReducedMotion;
  if (!animatedView || !fadeInDown || !useReducedMotionHook) {
    animatedView = undefined;
    fadeInDown = undefined;
    useReducedMotionHook = undefined;
  }
} catch {
  animatedView = undefined;
}

/**
 * Subtle entrance animation, consistent with the welcome screen.
 * Instant when the user prefers reduced motion — or when Reanimated is
 * unavailable (tests). Never used on list rows.
 */
export function FadeInView({ children, style, delay = 0, distance = 10 }: PropsWithChildren<FadeInViewProps>) {
  if (!animatedView || !fadeInDown || !useReducedMotionHook) return <View style={style}>{children}</View>;
  return <AnimatedEntrance style={style} delay={delay} distance={distance}>{children}</AnimatedEntrance>;
}

function AnimatedEntrance({ children, style, delay, distance }: PropsWithChildren<Required<Pick<FadeInViewProps, 'delay' | 'distance'>> & Pick<FadeInViewProps, 'style'>>) {
  const reduceMotion = useReducedMotionHook?.() ?? false;
  if (reduceMotion) return <View style={style}>{children}</View>;
  const EnteringView = animatedView as unknown as React.ComponentType<{ entering?: unknown; style?: StyleProp<ViewStyle>; children?: React.ReactNode }>;
  const entering = (fadeInDown as AnyRecord)?.duration(180)?.delay(delay)?.withInitialValues({ transform: [{ translateY: distance }] });
  return (
    <EnteringView entering={entering} style={style}>
      {children}
    </EnteringView>
  );
}
