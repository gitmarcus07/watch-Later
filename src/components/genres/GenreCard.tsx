import { memo } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/common/AppText';
import { triggerLightHaptic } from '@/lib/haptics';
import { radius, spacing } from '@/theme';

interface GenreCardProps {
  name: string;
  /** [glow corner, deep corner] — the genre's own hue from the catalog. */
  gradient: readonly [string, string];
  width?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * The one genre tile: a vivid two-stop gradient panel with the genre name
 * centered — no imagery, no emoji, the hue alone carries the identity. The
 * genres grid lays it out full-width per column; the home carousel uses it
 * at the franchise-card footprint, so both screens show the same face.
 */
export const GenreCard = memo(function GenreCard({ name, gradient, width, style, onPress }: GenreCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Browse the ${name} genre`}
      accessibilityHint="Opens the genre shelf"
      onPress={() => {
        triggerLightHaptic();
        onPress?.();
      }}
      style={({ pressed }) => [styles.card, width ? { width } : undefined, style, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.panel}
      >
        <AppText variant="heading3" numberOfLines={2} style={styles.name}>{name}</AppText>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { minHeight: 112 },
  panel: {
    flex: 1,
    minHeight: 112,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  name: { color: '#FFFFFF', textAlign: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
