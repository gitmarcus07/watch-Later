import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, LibraryListSkeleton } from '@/components/feedback/FeedbackViews';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { useMovieWatchedMutation, useWatchedLibrary } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { colors, radius, spacing } from '@/theme';
import type { CatalogMedia } from '@/domain/models/media';
import type { WatchedLibraryItem } from '@/domain/models/watchState';

type Filter = 'all' | 'movie' | 'series';
const filters: { label: string; value: Filter }[] = [{ label: 'All', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'Series', value: 'series' }];

function MovieRow({ media, onOpen }: { media: CatalogMedia; onOpen: () => void }) {
  const mutation = useMovieWatchedMutation(media, true);
  useEffect(() => { if (mutation.error) Alert.alert('Couldn’t update watched status', friendlyErrorMessage(mutation.error)); }, [mutation.error]);
  return <TrackedMediaRow media={media} badge="Watched" onPress={onOpen} actionLabel={`Mark ${media.title} unwatched`} actionIcon="checkmark-circle" actionDisabled={mutation.isPending} onAction={() => mutation.mutate()} />;
}

function SeriesRow({ item, onOpen }: { item: Extract<WatchedLibraryItem, { kind: 'series' }>; onOpen: () => void }) {
  const { progress } = item;
  const denominator = progress.totalEpisodeCount ?? progress.cachedEpisodeCount;
  const completionLabel = progress.isComplete ? 'Complete' : 'In progress';
  return <TrackedMediaRow media={progress.media} subtitle={`${progress.watchedEpisodeCount} watched / ${denominator} ${progress.totalEpisodeCount ? 'known' : 'loaded'} episodes`} badge={completionLabel} progress={progress.progress} onPress={onOpen} />;
}

export default function WatchedScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useWatchedLibrary();
  const entries = (query.data ?? []).filter((item) => filter === 'all' || (filter === 'movie' ? item.kind === 'movie' : item.kind === 'series'));
  const open = (media: CatalogMedia) => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(media) } });
  const empty = <EmptyState icon="checkmark-done-outline" title="Nothing watched yet" message="Movies you mark watched and episodes you finish will appear here. Your progress is tracked on this device." actionLabel="Explore titles" onAction={() => router.push('/(tabs)/search')} />;
  const header = <View><View style={styles.header}><AppText variant="heading1">Watched</AppText><AppText variant="bodySmall" muted>Movies and episode progress saved on this device.</AppText></View><View style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: filter === item.value }} accessibilityLabel={`Show ${item.label} watched`} onPress={() => setFilter(item.value)} style={[styles.chip, filter === item.value && styles.active]}><AppText variant="label" style={{ color: filter === item.value ? colors.accent : colors.textSecondary }}>{item.label}</AppText></Pressable>)}</View><AppText variant="caption" muted style={styles.count}>{entries.length} {entries.length === 1 ? 'title' : 'titles'}</AppText></View>;
  return <Screen><FlatList
    data={entries}
    keyExtractor={(item) => item.kind === 'movie' ? item.media.id : item.progress.media.id}
    renderItem={({ item }) => item.kind === 'movie' ? <MovieRow media={item.media} onOpen={() => open(item.media)} /> : <SeriesRow item={item} onOpen={() => open(item.progress.media)} />}
    ListHeaderComponent={header}
    ListEmptyComponent={query.isLoading ? <LibraryListSkeleton /> : query.isError ? <ErrorView message="Couldn't load watched titles. Your data is safe." onRetry={() => void query.refetch()} /> : empty}
    contentContainerStyle={entries.length ? styles.list : styles.emptyList}
    showsVerticalScrollIndicator={false}
    initialNumToRender={12}
    windowSize={7}
    removeClippedSubviews
  /></Screen>;
}

const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, gap: spacing.xs }, filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { backgroundColor: 'rgba(182,156,255,0.12)', borderColor: colors.accent }, count: { marginTop: spacing.lg, marginBottom: spacing.sm }, list: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }, emptyList: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] } });
