import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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

/**
 * Gentle shimmer for loading placeholders. Uses the core Animated API (not
 * Reanimated) so it also pulses inside the Jest renderer. Respects nothing
 * else: skeletons are decorative and hidden from screen readers by their
 * labelled parent progressbar.
 */
function Pulse({ style }: { style: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]} />;
}

export function PosterSkeleton() { return <Pulse style={styles.posterSkeleton} />; }
export function SearchResultSkeleton() { return <View style={styles.resultSkeleton}><Pulse style={styles.resultPoster} /><View style={styles.resultCopy}><Pulse style={styles.line} /><Pulse style={[styles.line, styles.shortLine]} /></View></View>; }
export function LibraryListSkeleton({ rows = 5 }: { rows?: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading your library">{Array.from({ length: rows }, (_, index) => <View key={index} style={styles.libraryRow}><Pulse style={styles.libraryPoster} /><View style={styles.resultCopy}><Pulse style={styles.line} /><Pulse style={[styles.line, styles.shortLine]} /></View></View>)}</View>;
}
export function DetailSkeleton() { return <View style={styles.detailSkeleton} accessibilityRole="progressbar" accessibilityLabel="Loading title details"><Pulse style={styles.detailHero} /><Pulse style={styles.detailLine} /><Pulse style={[styles.detailLine, styles.mediumLine]} /><View style={styles.detailBody}><Pulse style={[styles.line, styles.shortLine]} /><Pulse style={styles.bodyBlock} /><Pulse style={[styles.line, styles.mediumLine]} /></View></View>; }

/** Mirrors the episode row layout (number · still · title/meta · check) so the list shape holds while episodes load. */
export function EpisodeListSkeleton({ rows = 4 }: { rows?: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading episodes">{Array.from({ length: rows }, (_, index) => (
    <View key={index} style={styles.episodeRow}>
      <Pulse style={styles.episodeNumber} />
      <Pulse style={styles.episodeStill} />
      <View style={styles.episodeCopy}><Pulse style={styles.line} /><Pulse style={[styles.line, styles.shortLine]} /></View>
      <Pulse style={styles.episodeCheck} />
    </View>
  ))}</View>;
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl }, icon: { width: 62, height: 62, borderRadius: radius.large, backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, title: { textAlign: 'center' }, message: { textAlign: 'center', maxWidth: 280, lineHeight: 22 }, posterSkeleton: { width: 132, height: 192, backgroundColor: colors.surfaceElevated, borderRadius: radius.medium }, resultSkeleton: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, resultPoster: { width: 58, height: 82, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, resultCopy: { flex: 1, gap: spacing.md }, line: { height: 14, width: '70%', borderRadius: radius.pill, backgroundColor: colors.surfaceElevated }, shortLine: { width: '42%' }, libraryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, libraryPoster: { width: 62, height: 88, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, detailSkeleton: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md }, detailHero: { height: 350, marginHorizontal: -spacing.xl, marginBottom: spacing.xl, backgroundColor: colors.surfaceElevated }, detailLine: { width: '75%', height: 24, marginBottom: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated }, mediumLine: { width: '48%' }, detailBody: { marginTop: spacing.xl, gap: spacing.md }, bodyBlock: { height: 100, borderRadius: radius.medium, backgroundColor: colors.surface }, episodeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, episodeNumber: { width: 34, height: 34, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, episodeStill: { width: 74, height: 48, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, episodeCopy: { flex: 1, gap: spacing.md }, episodeCheck: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.surfaceElevated } });
