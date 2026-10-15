import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { FadeInView } from '@/components/common/FadeInView';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState, ErrorView, PosterSkeleton } from '@/components/feedback/FeedbackViews';
import { PosterCard } from '@/components/media/PosterCard';
import type { CatalogMedia } from '@/domain/models/media';
import { CatalogError } from '@/domain/errors/CatalogError';
import { useUpcomingAnimePages, useUpcomingMoviesPages, useUpcomingSeriesPages } from '@/features/catalog/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { upcomingSubtitle } from '@/features/catalog/upcoming';
import { triggerLightHaptic } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

type UpcomingFilter = 'all' | 'movies' | 'series' | 'anime';
const FILTERS: { label: string; value: UpcomingFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Movies', value: 'movies' },
  { label: 'Series', value: 'series' },
  { label: 'Anime', value: 'anime' },
];

export default function UpcomingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<UpcomingFilter>('all');
  const movies = useUpcomingMoviesPages(filter === 'all' || filter === 'movies');
  const series = useUpcomingSeriesPages(filter === 'all' || filter === 'series');
  const anime = useUpcomingAnimePages(filter === 'all' || filter === 'anime');
  const queries = filter === 'movies' ? [movies] : filter === 'series' ? [series] : filter === 'anime' ? [anime] : [movies, series, anime];

  const moviesData = movies.data;
  const seriesData = series.data;
  const animeData = anime.data;

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: CatalogMedia[] = [];
    const sources = filter === 'movies' ? [moviesData] : filter === 'series' ? [seriesData] : filter === 'anime' ? [animeData] : [moviesData, seriesData, animeData];
    for (const data of sources) {
      for (const page of data?.pages ?? []) {
        for (const media of page.items) {
          if (seen.has(media.id)) continue;
          seen.add(media.id);
          merged.push(media);
        }
      }
    }
    // Oldest release date first; undated titles sink to the bottom. Sorted
    // once per data change — new pages append at their sorted position, but
    // the list remounts on filter change (key below) so mid-scroll reorders
    // never yank the viewport.
    return merged.sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'));
  }, [moviesData, seriesData, animeData, filter]);

  const cardWidth = Math.max(120, Math.floor((Math.min(width, 760) - spacing.xl * 2 - spacing.md) / 2));
  const openMedia = (id: string) => router.push({ pathname: '/media/[id]', params: { id } });
  const loading = queries.some((query) => query.isLoading) && !items.length;
  const failed = queries.every((query) => query.isError) && !items.length;
  const firstError = queries.map((query) => query.error).find((error) => error instanceof CatalogError);
  const fetchingMore = queries.some((query) => query.isFetchingNextPage);
  const refetching = queries.some((query) => query.isRefetching && !query.isFetchingNextPage);
  const canLoadMore = queries.some((query) => query.hasNextPage);

  // onEndReached fires repeatedly during fast flings — without a momentum
  // guard it stacks page fetches, and each append + global re-sort yanks the
  // viewport up/down. Only one paged fetch per fling.
  const momentumGuard = useRef(true);
  const loadMore = () => {
    if (momentumGuard.current) return;
    momentumGuard.current = true;
    for (const query of queries) {
      if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetching) void query.fetchNextPage();
    }
  };

  const refetchAll = () => {
    for (const query of queries) void query.refetch();
  };

  return <Screen>
    <FadeInView><View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /><View style={styles.title}><AppText variant="heading1">Upcoming</AppText></View></View></FadeInView>
    <View style={styles.filters}>{FILTERS.map((option) => {
      const selected = option.value === filter;
      return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Show upcoming ${option.label}`} onPress={() => { if (!selected) triggerLightHaptic(); setFilter(option.value); }} style={[styles.filter, selected && styles.filterActive]}><AppText variant="label" style={selected ? styles.filterTextActive : styles.filterText}>{option.label}</AppText></Pressable>;
    })}</View>
    {loading ? <FlatList data={[0, 1, 2, 3, 4, 5]} keyExtractor={(item) => String(item)} numColumns={2} columnWrapperStyle={styles.gridRow} contentContainerStyle={styles.grid} style={styles.flat} renderItem={() => <PosterSkeleton />} showsVerticalScrollIndicator={false} />
      : failed ? <ErrorView message={firstError instanceof CatalogError ? firstError.userMessage : 'Could not load upcoming titles. Check your connection and try again.'} onRetry={refetchAll} />
      : items.length ? <FlatList
        key={filter}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        style={styles.flat}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={11}
        removeClippedSubviews={false}
        onMomentumScrollBegin={() => { momentumGuard.current = false; }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refetching} onRefresh={refetchAll} tintColor={colors.accent} colors={[colors.accent]} />}
        ListFooterComponent={fetchingMore ? <View style={styles.footer}><ActivityIndicator color={colors.accent} /><AppText variant="caption" muted>Loading more…</AppText></View> : !canLoadMore ? <AppText variant="caption" muted style={styles.end}>You have seen it all</AppText> : null}
        renderItem={({ item }) => <PosterCard title={item.title} subtitle={upcomingSubtitle(item)} posterUri={item.posterUrl} width={cardWidth} onPress={() => openMedia(mediaRouteId(item))} />}
      />
      : <EmptyState icon="calendar-outline" title="No upcoming titles" message="Nothing dated in the future right now — check back soon." actionLabel="Browse instead" onAction={() => router.push('/browse')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { flex: 1, gap: spacing.xs },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  filter: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.textSecondary },
  filterTextActive: { color: colors.white },
  flat: { flex: 1 },
  grid: { paddingBottom: spacing['2xl'], gap: spacing.md },
  gridRow: { gap: spacing.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  end: { textAlign: 'center', paddingVertical: spacing.xl },
});
