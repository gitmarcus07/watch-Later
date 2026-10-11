import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { AppText } from '@/components/common/AppText';
import { usePressScale } from '@/lib/pressScale';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'text' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function AppButton({ label, onPress, variant = 'primary', loading = false, disabled = false, icon }: AppButtonProps) {
  const primary = variant === 'primary';
  const secondary = variant === 'secondary' || variant === 'ghost';
  const { pressScaleStyle, pressIn, pressOut } = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : secondary ? styles.secondary : styles.textButton,
        variant === 'ghost' && styles.ghost,
        primary && shadows.glow,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      <Animated.View style={[styles.scaler, pressScaleStyle]}>
        {loading ? <ActivityIndicator color={primary ? colors.background : colors.accent} /> : (
          <View style={styles.content}>
            {icon}
            <AppText variant="button" style={primary ? styles.primaryLabel : styles.secondaryLabel}>{label}</AppText>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  textButton: { backgroundColor: 'transparent' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  scaler: { alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: colors.background, ...typography.button },
  secondaryLabel: { color: colors.textPrimary },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});

type NamedButtonProps = Omit<AppButtonProps, 'variant'>;
export const PrimaryButton = (props: NamedButtonProps) => <AppButton {...props} variant="primary" />;
export const SecondaryButton = (props: NamedButtonProps) => <AppButton {...props} variant="secondary" />;
export const GhostButton = (props: NamedButtonProps) => <AppButton {...props} variant="ghost" />;
