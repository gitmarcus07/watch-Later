import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { SearchResultCard } from '@/components/media/SearchResultCard';
import { mockMedia } from '@/features/catalog/mock/mockMedia';
import { colors, radius, spacing, typography } from '@/theme';

const filters = ['All', 'Movies', 'Shows', 'Anime'] as const;
export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => mockMedia.filter((item) => (!normalized || item.title.toLowerCase().includes(normalized)) && (filter === 'All' || (filter === 'Movies' ? item.kind === 'Movie' : filter === 'Shows' ? item.kind === 'Series' : item.kind === 'Anime'))), [normalized, filter]);
  const openResult = (id: string) => { Keyboard.dismiss(); router.push({ pathname: '/media/[id]', params: { id } }); };
  return <Screen scroll><View style={styles.header}><AppText variant="heading1">Search</AppText><AppText variant="bodySmall" muted>Find your next favorite</AppText></View>
    <View style={[styles.inputWrap, query.length > 0 && styles.inputFilled]}><Ionicons name="search" size={20} color={colors.textMuted} /><TextInput accessibilityLabel="Search movies, shows and anime" placeholder="Movies, shows and anime" placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={styles.input} selectionColor={colors.accent} />{query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={19} color={colors.textSecondary} /></Pressable> : null}</View>
    <View style={styles.filters}>{filters.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === filter }} onPress={() => setFilter(item)} style={[styles.filter, item === filter && styles.filterActive]}><AppText variant="label" style={item === filter ? styles.filterTextActive : styles.filterText}>{item}</AppText></Pressable>)}</View>
    {normalized && results.length === 0 ? <View style={styles.empty}><EmptyState icon="search-outline" title="No results found" message="Try another title or explore a different category." /></View> : !normalized ? <View style={styles.empty}><EmptyState icon="search-outline" title="Search for movies, shows and anime" message="Enter a title to see sample results." /></View> : <View style={styles.results}><AppText variant="heading3" style={styles.resultTitle}>Preview results</AppText>{results.map((item) => <SearchResultCard key={item.id} media={item} onPress={() => openResult(item.id)} />)}</View>}
  </Screen>;
}
const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs }, inputWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, inputFilled: { borderColor: colors.accent }, input: { flex: 1, color: colors.textPrimary, ...typography.body }, filters: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.lg }, filter: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: 'rgba(182,156,255,0.14)', borderColor: colors.accent }, filterText: { color: colors.textSecondary }, filterTextActive: { color: colors.accent }, empty: { minHeight: 330 }, results: { paddingTop: spacing.md }, resultTitle: { marginBottom: spacing.lg }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }, });
