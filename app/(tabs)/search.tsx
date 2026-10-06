import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, SearchResultSkeleton } from '@/components/feedback/FeedbackViews';
import { SearchResultCard } from '@/components/media/SearchResultCard';
import { useCatalogSearch } from '@/features/catalog/hooks';
import { CatalogError } from '@/domain/errors/CatalogError';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import type { CatalogFilter } from '@/domain/models/media';
import { colors, radius, spacing, typography } from '@/theme';
import { useLibraryStatuses } from '@/features/watchState/hooks';

const filters: { label: string; value: CatalogFilter }[] = [
  { label: 'All', value: 'all' }, { label: 'Movies', value: 'movies' },
  { label: 'Shows', value: 'series' }, { label: 'Anime', value: 'anime' },
];

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const normalized = query.trim();
  const search = useCatalogSearch(debouncedQuery, filter, Boolean(normalized && normalized === debouncedQuery));
  const libraryStatuses = useLibraryStatuses(search.data?.items ?? []);
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);
  const searching = Boolean(normalized) && (normalized !== debouncedQuery || search.isLoading);
  const openResult = (id: string) => { Keyboard.dismiss(); router.push({ pathname: '/media/[id]', params: { id } }); };
  const changeQuery = (value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const next = value.trim();
    if (!next) { setDebouncedQuery(''); return; }
    if (next !== debouncedQuery) setDebouncedQuery('');
    debounceTimer.current = setTimeout(() => setDebouncedQuery(next), 320);
  };
  const errorMessage = search.error instanceof CatalogError ? search.error.userMessage : 'Could not load catalog results. Check your connection and try again.';

  return <Screen scroll><View style={styles.header}><AppText variant="heading1">Search</AppText><AppText variant="bodySmall" muted>Find your next favorite</AppText></View>
    <View style={[styles.inputWrap, normalized.length > 0 && styles.inputFilled]}><Ionicons name="search" size={20} color={colors.textMuted} /><TextInput accessibilityLabel="Search movies, shows and anime" placeholder="Movies, shows and anime" placeholderTextColor={colors.textMuted} value={query} onChangeText={changeQuery} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={styles.input} selectionColor={colors.accent} />{query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => changeQuery('')} hitSlop={10}><Ionicons name="close-circle" size={19} color={colors.textSecondary} /></Pressable> : null}</View>
    <View style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: item.value === filter }} onPress={() => setFilter(item.value)} style={[styles.filter, item.value === filter && styles.filterActive]}><AppText variant="label" style={item.value === filter ? styles.filterTextActive : styles.filterText}>{item.label}</AppText></Pressable>)}</View>
    {!normalized ? <View style={styles.empty}><EmptyState icon="search-outline" title="Search for movies, shows and anime" message="Search real catalog metadata from TMDb and AniList." /></View>
      : searching ? <View style={styles.results}><AppText variant="heading3" style={styles.resultTitle}>Searching the catalog</AppText>{[0, 1, 2].map((index) => <SearchResultSkeleton key={index} />)}</View>
      : search.isError ? <View style={styles.error}><ErrorView message={errorMessage} onRetry={() => void search.refetch()} /></View>
      : !search.data?.items.length ? <View style={styles.empty}><EmptyState icon="search-outline" title="No results found" message="Try another title or explore a different category." /></View>
      : <View style={styles.results}><AppText variant="heading3" style={styles.resultTitle}>Results</AppText>{search.data.unavailableProviders.length ? <AppText variant="caption" muted style={styles.partial}>{search.data.unavailableProviders.map((provider) => provider === 'tmdb' ? 'TMDb' : 'AniList').join(' and ')} results are temporarily unavailable.</AppText> : null}{search.data.items.map((item) => <SearchResultCard key={item.id} media={item} status={libraryStatuses.data?.[item.id]} onPress={() => openResult(mediaRouteId(item))} />)}</View>}
  </Screen>;
}

const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs }, inputWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, inputFilled: { borderColor: colors.accent }, input: { flex: 1, color: colors.textPrimary, ...typography.body }, filters: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.lg }, filter: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterActive: { backgroundColor: 'rgba(182,156,255,0.14)', borderColor: colors.accent }, filterText: { color: colors.textSecondary }, filterTextActive: { color: colors.accent }, empty: { minHeight: 330 }, error: { minHeight: 360 }, results: { paddingTop: spacing.md }, resultTitle: { marginBottom: spacing.lg }, partial: { marginTop: -spacing.md, marginBottom: spacing.md } });
