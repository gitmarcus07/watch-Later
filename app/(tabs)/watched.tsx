import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { FadeInView } from '@/components/common/FadeInView';
import { EmptyState, ErrorView, LibraryListSkeleton } from '@/components/feedback/FeedbackViews';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { LibrarySearchInput } from '@/components/library/controls';
import { useMovieWatchedMutation, useWatchedLibrary, watchKeys } from '@/features/watchState/hooks';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { scheduleAutoSync } from '@/features/sync/autoSync';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { matchesLocalQuery } from '@/lib/localSearch';
import { groupByMonth, timeAgo } from '@/lib/relativeTime';
import { colors, radius, spacing } from '@/theme';
import type { CatalogMedia } from '@/domain/models/media';
import type { WatchedLibraryItem } from '@/domain/models/watchState';

type Filter = 'all' | 'movie' | 'series';
const filters: { label: string; value: Filter }[] = [{ label: 'All', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'Shows', value: 'series' }];

function watchedDateOf(item: WatchedLibraryItem): string | undefined {
  return item.kind === 'movie' ? item.watchedAt : item.progress.lastWatchedAt;
}

function MovieRow({ media, watchedAt, onOpen }: { media: CatalogMedia; watchedAt: string; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMovieWatchedMutation(media, true);
  useEffect(() => { if (mutation.error) void showDialog({ type: 'error', title: 'Couldn’t update watched status', message: friendlyErrorMessage(mutation.error) }); }, [mutation.error]);
  const undo = () => {
    void watchStateRepository.markMovieWatched(media, true).then(() => {
      void queryClient.invalidateQueries({ queryKey: watchKeys.all });
      scheduleAutoSync('mutation');
    }).catch((undoError: unknown) => {
      void showDialog({ type: 'error', title: 'Couldn’t restore', message: friendlyErrorMessage(undoError) });
    });
  };
  const ago = timeAgo(watchedAt);
  return <TrackedMediaRow media={media} hideOverview subtitle={[media.year, 'Movie', ago].filter(Boolean).join(' • ')} onPress={onOpen} actionLabel={`Mark ${media.title} unwatched`} actionIcon="checkmark-circle" actionDisabled={mutation.isPending} onAction={() => mutation.mutate(undefined, { onSuccess: () => showToast('Marked unwatched', 'info', { actionLabel: 'Undo', durationMs: 10000, onAction: undo }) })} />;
}

function SeriesRow({ item, onOpen }: { item: Extract<WatchedLibraryItem, { kind: 'series' }>; onOpen: () => void }) {
  const { progress } = item;
  const seasonNumber = progress.nextEpisode?.seasonNumber ?? progress.nextSeasonNumber;
  const pill = progress.isComplete ? 'Complete' : seasonNumber !== undefined ? `S${seasonNumber}` : undefined;
  const ago = timeAgo(progress.lastWatchedAt);
  return <TrackedMediaRow media={progress.media} hideOverview subtitle={[progress.media.year, 'Show', ago].filter(Boolean).join(' • ')} badge={pill} badgeTone="success" progress={progress.isComplete ? undefined : progress.progress} onPress={onOpen} />;
}

type WatchedRowItem = { key: string; item: WatchedLibraryItem };
type WatchedListRow = { type: 'header'; key: string; label: string } | ({ type: 'row' } & WatchedRowItem);

function WatchedListRowView({ row, open }: { row: WatchedListRow; open: (media: CatalogMedia) => void }) {
  if (row.type === 'header') {
    return <View style={styles.monthHeader}><AppText variant="caption" style={styles.monthLabel}>{row.label}</AppText><View style={styles.monthLine} /></View>;
  }
  const item: WatchedLibraryItem = row.item;
  if (item.kind === 'movie') {
    return <MovieRow media={item.media} watchedAt={item.watchedAt} onOpen={() => open(item.media)} />;
  }
  return <SeriesRow item={item} onOpen={() => open(item.progress.media)} />;
}

export default function WatchedScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const query = useWatchedLibrary();
  const mediaOf = (item: WatchedLibraryItem): CatalogMedia => item.kind === 'movie' ? item.media : item.progress.media;
  const filtered = useMemo(() => (query.data ?? []).filter((item) => {
    const media = mediaOf(item);
    return (filter === 'all' || (filter === 'movie' ? item.kind === 'movie' : item.kind === 'series')) &&
      matchesLocalQuery(media.title, search);
  }), [query.data, filter, search]);
  const groups = useMemo(() => groupByMonth(filtered, watchedDateOf), [filtered]);
  const rows: WatchedListRow[] = useMemo(() => groups.flatMap((group) => [
    { type: 'header', key: `header:${group.key}`, label: group.label },
    ...group.items.map((item: WatchedLibraryItem): WatchedListRow => ({ type: 'row', key: item.kind === 'movie' ? item.media.id : item.progress.media.id, item })),
  ]), [groups]);
  const open = (media: CatalogMedia) => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(media) } });
  const empty = <EmptyState icon="checkmark-done-outline" title="Nothing watched yet" message="Movies you mark watched and episodes you finish will appear here. Your progress is tracked on this device." actionLabel="Explore titles" onAction={() => router.push('/search')} />;
  const header = <View>
    <View style={styles.titleRow}>
      <View style={styles.titleCopy}>
        <AppText variant="caption" style={styles.eyebrow}>FINISHED</AppText>
        <AppText variant="heading1" style={styles.title}>Watched</AppText>
      </View>
      <View style={styles.countBadge}><Ionicons name="checkmark-circle" size={13} color={colors.success} /><AppText variant="label" style={styles.countText}>{filtered.length}</AppText></View>
    </View>
    <View style={styles.filters}>{filters.map((item) => {
      const selected = filter === item.value;
      return <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Show ${item.label} watched`} onPress={() => setFilter(item.value)} style={[styles.chip, selected && styles.active]}><AppText variant="label" style={{ color: selected ? colors.white : colors.textSecondary }}>{item.label}</AppText></Pressable>;
    })}</View>
    <LibrarySearchInput value={search} onChange={setSearch} label="Search watched titles" />
  </View>;
  return <Screen><FlatList
    data={rows}
    keyExtractor={(row) => row.key}
    renderItem={({ item: row }) => <WatchedListRowView row={row} open={open} />}
    ListHeaderComponent={<FadeInView><View>{header}</View></FadeInView>}
    ListEmptyComponent={query.isLoading ? <LibraryListSkeleton /> : query.isError ? <ErrorView message="Couldn't load watched titles. Your data is safe." onRetry={() => void query.refetch()} /> : empty}
    contentContainerStyle={rows.length ? styles.list : styles.emptyList}
    style={styles.flat}
    showsVerticalScrollIndicator={false}
    initialNumToRender={12}
    windowSize={7}
    removeClippedSubviews
    refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isLoading} onRefresh={() => void query.refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
  /></Screen>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.lg },
  titleCopy: { flex: 1, gap: 2 },
  eyebrow: { color: colors.success, letterSpacing: 2 },
  title: { color: colors.white },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  countText: { color: colors.textPrimary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  monthLabel: { color: colors.textMuted, letterSpacing: 1 },
  monthLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  flat: { flex: 1 },
  list: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
  emptyList: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
});
