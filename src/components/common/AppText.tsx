import type { ColorValue, TextProps } from 'react-native';
import { Text } from 'react-native';
import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;
interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  color?: ColorValue;
}

export function AppText({ variant = 'body', muted = false, color, style, ...props }: AppTextProps) {
  return (
    <Text
      accessibilityRole={props.accessibilityRole}
      {...props}
      style={[typography[variant], { color: color ?? (muted ? colors.textSecondary : colors.textPrimary) }, style]}
    />
  );
}
