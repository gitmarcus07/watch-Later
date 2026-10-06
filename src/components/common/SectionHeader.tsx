import { StyleSheet, View } from 'react-native';
import { spacing, typography } from '@/theme';
import { AppText } from './AppText';

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.container}><AppText variant="heading2" style={typography.heading2}>{title}</AppText>{subtitle ? <AppText muted variant="bodySmall">{subtitle}</AppText> : null}</View>;
}

const styles = StyleSheet.create({ container: { gap: spacing.xs, marginBottom: spacing.xl } });
