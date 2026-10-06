import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { CONTENT_MAX_WIDTH } from '@/theme/responsive';
import { colors, spacing } from '@/theme';

export function Screen({ children, scroll = false }: PropsWithChildren<{ scroll?: boolean }>) {
  const { width } = useWindowDimensions();
  const wide = width >= CONTENT_MAX_WIDTH + 2 * spacing.xl;
  const wideStyle: ViewStyle | false = wide && { maxWidth: CONTENT_MAX_WIDTH, width: '100%', alignSelf: 'center' };
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll
        ? <ScrollView contentContainerStyle={[styles.scrollContent, wideStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"><OfflineBanner />{children}</ScrollView>
        : <View style={[styles.content, wideStyle]}><OfflineBanner />{children}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, paddingHorizontal: spacing.xl }, scrollContent: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg } });
