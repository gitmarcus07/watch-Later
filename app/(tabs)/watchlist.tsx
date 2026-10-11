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
import { PRIORITY_META, PRIORITY_ORDER } from '@/features/watchState/priority';
import type { WatchPriority, WatchlistEntry } from '@/domain/models/watchState';
import { useToggleWatchlist, useWatchlist, watchKeys } from '@/features/watchState/hooks';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { scheduleAutoSync } from '@/features/sync/autoSync';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { matchesLocalQuery } from '@/lib/localSearch';
import { timeAgo } from '@/lib/relativeTime';
import { colors, radius, spacing } from '@/theme';

type PriorityFilter = 'all' | WatchPriority;

function WatchlistRow({ entry, onOpen }: { entry: WatchlistEntry; onOpen: () => void }) {
  const { media } = entry;
  const queryClient = useQueryClient();
  const { toggle, isMutating, error } = useToggleWatchlist(media);
  useEffect(() => { if (error) void showDialog({ type: 'error', title: 'Couldn’t update your watchlist', message: friendlyErrorMessage(error) }); }, [error]);
  const undoRemove = () => {
    void watchStateRepository.saveToWatchlist(media, entry.priority).then(() => {
      void queryClient.invalidateQueries({ queryKey: watchKeys.all });
      scheduleAutoSync('mutation');
    }).catch((undoError: unknown) => {
      void showDialog({ type: 'error', title: 'Couldn’t restore', message: friendlyErrorMessage(undoError) });
    });
  };
  const kind = media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'Show' : 'Anime';
  const highlight = entry.priority
    ? { text: `${PRIORITY_META[entry.priority].label} • ${timeAgo(entry.addedAt)}`, color: PRIORITY_META[entry.priority].color }
    : { text: `Saved • ${timeAgo(entry.addedAt)}`, color: colors.textMuted };
  return <TrackedMediaRow media={media} hideOverview subtitle={[media.year, kind].filter(Boolean).join(' • ')} highlight={highlight} onPress={onOpen} actionLabel={`Remove ${media.title} from watchlist`} actionIcon="bookmark" actionDisabled={isMutating} onAction={() => toggle(undefined, { onSuccess: () => showToast('Removed from watchlist', 'info', { actionLabel: 'Undo', durationMs: 10000, onAction: undoRemove }) })} />;
}

export default function WatchlistScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<PriorityFilter>('all');
  const [search, setSearch] = useState('');
  const query = useWatchlist();
  const entries = useMemo(() => (query.data ?? []).filter(({ media, priority }) =>
    (filter === 'all' || priority === filter) && matchesLocalQuery(media.title, search),
  ), [query.data, filter, search]);
  const empty = filter === 'all'
    ? <EmptyState icon="bookmark-outline" title="Your watchlist is empty" message="You haven't saved anything yet. Search the catalog and save movies, shows, or anime to find them here." actionLabel="Find something to watch" onAction={() => router.push('/search')} />
    : <EmptyState icon="bookmark-outline" title={`No ${PRIORITY_META[filter].label} titles`} message="Tap Watch Later on any title and pick a priority to file it here." actionLabel="Browse titles" onAction={() => router.push('/search')} />;
  const header = <View>
    <View style={styles.titleRow}>
      <View style={styles.titleCopy}>
        <AppText variant="caption" style={styles.eyebrow}>TO WATCH</AppText>
        <AppText variant="heading1" style={styles.title}>Watchlist</AppText>
      </View>
      <View style={styles.countBadge}><Ionicons name="bookmark" size={13} color={colors.accent} /><AppText variant="label" style={styles.countText}>{entries.length}</AppText></View>
    </View>
    <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Filter by priority">
      <Pressable accessibilityRole="radio" accessibilityLabel="All priorities" accessibilityState={{ selected: filter === 'all' }} onPress={() => setFilter('all')} style={[styles.chip, filter === 'all' && styles.active]}>
        <AppText variant="label" style={{ color: filter === 'all' ? colors.white : colors.textSecondary }}>All</AppText>
      </Pressable>
      {PRIORITY_ORDER.map((priority) => {
        const meta = PRIORITY_META[priority];
        const selected = filter === priority;
        return (
          <Pressable key={priority} accessibilityRole="radio" accessibilityLabel={`Priority ${meta.label}`} accessibilityState={{ selected }} onPress={() => setFilter(priority)} style={[styles.chip, selected && styles.active]}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={14} color={selected ? colors.white : meta.color} />
            <AppText variant="label" style={{ color: selected ? colors.white : colors.textSecondary }}>{meta.label}</AppText>
          </Pressable>
        );
      })}
    </View>
    <LibrarySearchInput value={search} onChange={setSearch} label="Search your watchlist" />
  </View>;
  return <Screen><FlatList
    data={entries}
    keyExtractor={(item) => item.media.id}
    renderItem={({ item }) => <WatchlistRow entry={item} onOpen={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media) } })} />}
    ListHeaderComponent={<FadeInView><View>{header}</View></FadeInView>}
    ListEmptyComponent={query.isLoading ? <LibraryListSkeleton /> : query.isError ? <ErrorView message="Couldn't load your watchlist. Your data is safe." onRetry={() => void query.refetch()} /> : empty}
    contentContainerStyle={entries.length ? styles.list : styles.emptyList}
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
  eyebrow: { color: colors.accent, letterSpacing: 2 },
  title: { color: colors.white },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  countText: { color: colors.textPrimary },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  flat: { flex: 1 },
  list: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
  emptyList: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
});
