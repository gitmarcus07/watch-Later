/**
 * Full-page animated gradient for the auth screens.
 *
 * No posters here: a deep-violet base with three soft color orbs drifting on
 * slow independent loops (position + scale + opacity), so the surface always
 * feels alive behind the card content. Pure Reanimated — no images, no
 * network, never blank.
 */
import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

function Orb({ style, color, size, duration, dx, dy, delay = 0 }: {
  style: { top: number; left: number };
  color: string;
  size: number;
  duration: number;
  dx: number;
  dy: number;
  delay?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    const start = () => {
      t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
    };
    if (delay) {
      const timer = setTimeout(start, delay);
      return () => clearTimeout(timer);
    }
    start();
    return undefined;
  }, [t, duration, delay]);
  const orbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * dx },
      { translateY: t.value * dy },
      { scale: 1 + t.value * 0.18 },
    ],
    opacity: 0.5 + t.value * 0.25,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, orbStyle]}
    />
  );
}

export function AuthGradientBackground() {
  const sheen = useSharedValue(0);
  useEffect(() => {
    sheen.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [sheen]);
  const sheenStyle = useAnimatedStyle(() => ({ opacity: 0.25 + sheen.value * 0.3 }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#070312', '#150826', '#0A0A0C']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
      <Orb style={{ top: -H * 0.06, left: -W * 0.25 }} color="#7C3AED" size={W * 0.95} duration={11000} dx={W * 0.14} dy={H * 0.05} />
      <Orb style={{ top: H * 0.3, left: W * 0.45 }} color="#A855F7" size={W * 0.8} duration={14000} dx={-W * 0.16} dy={H * 0.06} delay={1200} />
      <Orb style={{ top: H * 0.68, left: -W * 0.3 }} color="#4C1D95" size={W * 0.9} duration={17000} dx={W * 0.12} dy={-H * 0.05} delay={2400} />
      <Animated.View style={[StyleSheet.absoluteFill, sheenStyle]}>
        <LinearGradient colors={['rgba(168,85,247,0.14)', 'transparent', 'rgba(7,3,18,0.5)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}
