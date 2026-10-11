import { Animated, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/theme';
import { usePressScale } from '@/lib/pressScale';

interface IconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  size?: number;
  variant?: 'default' | 'subtle' | 'accent';
}

export function IconButton({ name, label, onPress, size = 22, variant = 'default' }: IconButtonProps) {
  const { pressScaleStyle, pressIn, pressOut } = usePressScale(0.9);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={({ pressed }) => [styles.button, variant === 'subtle' && styles.subtle, variant === 'accent' && styles.accent, pressed && styles.pressed]}>
      <Animated.View style={pressScaleStyle}>
        <Ionicons name={name} size={size} color={variant === 'accent' ? colors.accent : variant === 'subtle' ? colors.textSecondary : colors.textPrimary} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  subtle: { width: 34, height: 34, backgroundColor: 'transparent' },
  accent: { backgroundColor: 'rgba(182,156,255,0.12)' },
  pressed: { opacity: 0.75 },
});
