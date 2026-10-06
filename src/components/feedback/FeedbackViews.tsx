import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';

export function LoadingView({ label = 'Loading' }: { label?: string }) {
  return <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.accent} size="large" /><AppText muted>{label}</AppText></View>;
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.container}><AppText variant="heading3" accessibilityRole="alert">Something went wrong</AppText><AppText muted accessibilityLiveRegion="polite">{message}</AppText>{onRetry ? <AppButton label="Try again" onPress={onRetry} variant="secondary" /> : null}</View>;
}

export function EmptyState({ title, message, icon = 'film-outline', actionLabel, onAction }: { title: string; message: string; icon?: keyof typeof Ionicons.glyphMap; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.container}><View style={styles.icon}><Ionicons name={icon} size={27} color={colors.accent} /></View><AppText variant="heading3" style={styles.title}>{title}</AppText><AppText muted style={styles.message}>{message}</AppText>{actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} /> : null}</View>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) { return <ErrorView message="We couldn't load this right now." onRetry={onRetry} />; }

export function PosterSkeleton() { return <View style={styles.posterSkeleton} />; }
export function SearchResultSkeleton() { return <View style={styles.resultSkeleton}><View style={styles.resultPoster} /><View style={styles.resultCopy}><View style={styles.line} /><View style={[styles.line, styles.shortLine]} /></View></View>; }
export function LibraryListSkeleton({ rows = 5 }: { rows?: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading your library">{Array.from({ length: rows }, (_, index) => <View key={index} style={styles.libraryRow}><View style={styles.libraryPoster} /><View style={styles.resultCopy}><View style={styles.line} /><View style={[styles.line, styles.shortLine]} /></View></View>)}</View>;
}
export function DetailSkeleton() { return <View style={styles.detailSkeleton} accessibilityRole="progressbar" accessibilityLabel="Loading title details"><View style={styles.detailHero} /><View style={styles.detailLine} /><View style={[styles.detailLine, styles.mediumLine]} /><View style={styles.detailBody}><View style={[styles.line, styles.shortLine]} /><View style={styles.bodyBlock} /><View style={[styles.line, styles.mediumLine]} /></View></View>; }

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }, icon: { width: 62, height: 62, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, title: { textAlign: 'center' }, message: { textAlign: 'center', maxWidth: 280, lineHeight: 22 }, posterSkeleton: { width: 132, height: 192, backgroundColor: colors.surfaceElevated, borderRadius: radius.medium }, resultSkeleton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, resultPoster: { width: 58, height: 82, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, resultCopy: { flex: 1, gap: spacing.md }, line: { height: 14, width: '70%', borderRadius: radius.pill, backgroundColor: colors.surfaceElevated }, shortLine: { width: '42%' }, libraryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, libraryPoster: { width: 62, height: 88, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, detailSkeleton: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md }, detailHero: { height: 350, marginHorizontal: -spacing.xl, marginBottom: spacing.xl, backgroundColor: colors.surfaceElevated }, detailLine: { width: '75%', height: 24, marginBottom: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated }, mediumLine: { width: '48%' }, detailBody: { marginTop: spacing.xl, gap: spacing.md }, bodyBlock: { height: 100, borderRadius: radius.medium, backgroundColor: colors.surface } });
