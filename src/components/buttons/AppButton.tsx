import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { AppText } from '@/components/common/AppText';

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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : variant === 'secondary' ? styles.secondary : styles.textButton,
        primary && shadows.glow,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? colors.background : colors.accent} /> : (
        <View style={styles.content}>
          {icon}
          <AppText variant="button" style={primary ? styles.primaryLabel : styles.secondaryLabel}>{label}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  textButton: { backgroundColor: 'transparent' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primaryLabel: { color: colors.background, ...typography.button },
  secondaryLabel: { color: colors.textPrimary },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});

type NamedButtonProps = Omit<AppButtonProps, 'variant'>;
export const PrimaryButton = (props: NamedButtonProps) => <AppButton {...props} variant="primary" />;
export const SecondaryButton = (props: NamedButtonProps) => <AppButton {...props} variant="secondary" />;
export const GhostButton = (props: NamedButtonProps) => <AppButton {...props} variant="ghost" />;
