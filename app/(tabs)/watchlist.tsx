import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { colors, radius, spacing } from '@/theme';

export default function WatchlistScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  return <Screen><View style={styles.header}><AppText variant="heading1">Watchlist</AppText><AppText variant="bodySmall" muted>Your next watches, all in one place.</AppText></View>
    <View style={styles.filters}>{['All', 'Movies', 'Shows', 'Anime'].map((label) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: filter === label }} onPress={() => setFilter(label)} style={[styles.chip, filter === label && styles.active]}><AppText variant="label" style={{ color: filter === label ? colors.accent : colors.textSecondary }}>{label}</AppText></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Sort watchlist" style={styles.sort}><Ionicons name="swap-vertical" size={18} color={colors.textSecondary} /></Pressable></View>
    <View style={styles.empty}><EmptyState icon="bookmark-outline" title="Your watchlist is empty" message="Save movies and shows you want to watch later." actionLabel="Find something to watch" onAction={() => router.push('/(tabs)/search')} /></View>
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, gap: spacing.xs }, filters: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl }, chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { backgroundColor: 'rgba(182,156,255,0.12)', borderColor: colors.accent }, sort: { marginLeft: 'auto', width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, empty: { flex: 1, marginTop: -spacing.xl } });
