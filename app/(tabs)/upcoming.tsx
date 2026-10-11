import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { FadeInView } from '@/components/common/FadeInView';
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

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: CatalogMedia[] = [];
    for (const query of queries) {
      for (const page of query.data?.pages ?? []) {
        for (const media of page.items) {
          if (seen.has(media.id)) continue;
          seen.add(media.id);
          merged.push(media);
        }
      }
    }
    // Oldest release date first; undated titles sink to the bottom.
    return merged.sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'));
  }, [movies.data, series.data, anime.data, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardWidth = Math.max(120, Math.floor((Math.min(width, 760) - spacing.xl * 2 - spacing.md) / 2));
  const openMedia = (id: string) => router.push({ pathname: '/media/[id]', params: { id } });
  const loading = queries.some((query) => query.isLoading) && !items.length;
  const failed = queries.every((query) => query.isError) && !items.length;
  const firstError = queries.map((query) => query.error).find((error) => error instanceof CatalogError);
  const fetchingMore = queries.some((query) => query.isFetchingNextPage);
  const canLoadMore = queries.some((query) => query.hasNextPage);
  const loadMore = () => {
    for (const query of queries) {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    }
  };

  return <Screen>
    <FadeInView><View style={styles.header}><View style={styles.title}><AppText variant="heading1">Upcoming</AppText><AppText variant="bodySmall" muted>Every future release — oldest first</AppText></View></View></FadeInView>
    <View style={styles.filters}>{FILTERS.map((option) => {
      const selected = option.value === filter;
      return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Show upcoming ${option.label}`} onPress={() => { if (!selected) triggerLightHaptic(); setFilter(option.value); }} style={[styles.filter, selected && styles.filterActive]}><AppText variant="label" style={selected ? styles.filterTextActive : styles.filterText}>{option.label}</AppText></Pressable>;
    })}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Upcoming on OTT for India" accessibilityHint="Coming soon" onPress={() => router.push('/ott-upcoming' as never)} style={({ pressed }) => [styles.ottBanner, pressed && styles.pressed]}><AppText variant="bodyMedium" style={styles.ottBannerText}>Upcoming on OTT · India</AppText><AppText variant="caption" style={styles.ottBannerSub}>Coming soon</AppText></Pressable>
    {loading ? <FlatList data={[0, 1, 2, 3, 4, 5]} keyExtractor={(item) => String(item)} numColumns={2} columnWrapperStyle={styles.gridRow} contentContainerStyle={styles.grid} style={styles.flat} renderItem={() => <PosterSkeleton />} showsVerticalScrollIndicator={false} />
      : failed ? <ErrorView message={firstError instanceof CatalogError ? firstError.userMessage : 'Could not load upcoming titles. Check your connection and try again.'} onRetry={() => { for (const query of queries) void query.refetch(); }} />
      : items.length ? <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        style={styles.flat}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={fetchingMore} onRefresh={() => { for (const query of queries) void query.refetch(); }} tintColor={colors.accent} colors={[colors.accent]} />}
        ListFooterComponent={fetchingMore ? <View style={styles.footer}><ActivityIndicator color={colors.accent} /><AppText variant="caption" muted>Loading more…</AppText></View> : !canLoadMore ? <AppText variant="caption" muted style={styles.end}>You have seen it all</AppText> : null}
        renderItem={({ item }) => <PosterCard title={item.title} subtitle={upcomingSubtitle(item)} posterUri={item.posterUrl} width={cardWidth} onPress={() => openMedia(mediaRouteId(item))} />}
      />
      : <EmptyState icon="calendar-outline" title="No upcoming titles" message="Nothing dated in the future right now — check back soon." actionLabel="Browse instead" onAction={() => router.push('/browse')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { gap: spacing.xs },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  filter: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.textSecondary },
  filterTextActive: { color: colors.white },
  ottBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md },
  ottBannerText: { color: colors.accent },
  ottBannerSub: { color: colors.textMuted },
  pressed: { opacity: 0.85 },
  flat: { flex: 1 },
  grid: { paddingBottom: spacing['2xl'], gap: spacing.md },
  gridRow: { gap: spacing.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  end: { textAlign: 'center', paddingVertical: spacing.xl },
});
