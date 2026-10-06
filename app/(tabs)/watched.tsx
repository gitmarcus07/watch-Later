import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { colors, radius, spacing } from '@/theme';

export default function WatchedScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  return <Screen><View style={styles.header}><AppText variant="heading1">Watched</AppText><AppText variant="bodySmall" muted>Your completed stories and episodes.</AppText></View>
    <View style={styles.filters}>{['All', 'Movies', 'Shows'].map((label) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: filter === label }} onPress={() => setFilter(label)} style={[styles.chip, filter === label && styles.active]}><AppText variant="label" style={{ color: filter === label ? colors.accent : colors.textSecondary }}>{label}</AppText></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Sort watched history" style={styles.sort}><Ionicons name="time-outline" size={18} color={colors.textSecondary} /></Pressable></View>
    <View style={styles.episodeHint}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><AppText variant="caption" muted style={styles.episodeText}>Watched episodes will appear individually in your activity.</AppText></View>
    <View style={styles.empty}><EmptyState icon="checkmark-done-outline" title="Nothing watched yet" message="Movies and episodes you finish will appear here." actionLabel="Explore titles" onAction={() => router.push('/(tabs)/search')} /></View>
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, gap: spacing.xs }, filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl }, chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { backgroundColor: 'rgba(182,156,255,0.12)', borderColor: colors.accent }, sort: { marginLeft: 'auto', width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, episodeHint: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', padding: spacing.md, marginTop: spacing.lg, borderRadius: radius.medium, backgroundColor: colors.surfaceSecondary }, episodeText: { flex: 1 }, empty: { flex: 1, marginTop: -spacing.xl } });
