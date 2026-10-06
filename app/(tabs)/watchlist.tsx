import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, LibraryListSkeleton } from '@/components/feedback/FeedbackViews';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { useWatchlist, useWatchlistMutation } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { colors, radius, spacing } from '@/theme';
import type { CatalogMedia } from '@/domain/models/media';

type Filter = 'all' | 'movie' | 'series' | 'anime';
const filters: { label: string; value: Filter }[] = [{ label: 'All', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'Shows', value: 'series' }, { label: 'Anime', value: 'anime' }];

function WatchlistRow({ media, onOpen }: { media: CatalogMedia; onOpen: () => void }) {
  const mutation = useWatchlistMutation(media, true);
  useEffect(() => { if (mutation.error) Alert.alert('Couldn’t update your watchlist', friendlyErrorMessage(mutation.error)); }, [mutation.error]);
  return <TrackedMediaRow media={media} onPress={onOpen} actionLabel={`Remove ${media.title} from watchlist`} actionIcon="bookmark" actionDisabled={mutation.isPending} onAction={() => mutation.mutate()} />;
}

export default function WatchlistScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useWatchlist();
  const entries = (query.data ?? []).filter(({ media }) => filter === 'all' || media.mediaType === filter);
  const empty = <EmptyState icon="bookmark-outline" title="Your watchlist is empty" message="You haven't saved anything yet. Search the catalog and bookmark movies, shows, or anime to find them here." actionLabel="Find something to watch" onAction={() => router.push('/(tabs)/search')} />;
  const header = <View><View style={styles.header}><AppText variant="heading1">Watchlist</AppText><AppText variant="bodySmall" muted>Your saved movies and series, stored on this device.</AppText></View><View style={styles.filters}>{filters.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: filter === item.value }} accessibilityLabel={`Show ${item.label} watchlist`} onPress={() => setFilter(item.value)} style={[styles.chip, filter === item.value && styles.active]}><AppText variant="label" style={{ color: filter === item.value ? colors.accent : colors.textSecondary }}>{item.label}</AppText></Pressable>)}</View><AppText variant="caption" muted style={styles.count}>{entries.length} {entries.length === 1 ? 'title' : 'titles'}</AppText></View>;
  return <Screen><FlatList
    data={entries}
    keyExtractor={(item) => item.media.id}
    renderItem={({ item }) => <WatchlistRow media={item.media} onOpen={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media) } })} />}
    ListHeaderComponent={header}
    ListEmptyComponent={query.isLoading ? <LibraryListSkeleton /> : query.isError ? <ErrorView message="Couldn't load your watchlist. Your data is safe." onRetry={() => void query.refetch()} /> : empty}
    contentContainerStyle={entries.length ? styles.list : styles.emptyList}
    showsVerticalScrollIndicator={false}
    initialNumToRender={12}
    windowSize={7}
    removeClippedSubviews
  /></Screen>;
}

const styles = StyleSheet.create({ header: { paddingTop: spacing.lg, gap: spacing.xs }, filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { backgroundColor: 'rgba(182,156,255,0.12)', borderColor: colors.accent }, count: { marginTop: spacing.lg, marginBottom: spacing.sm }, list: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] }, emptyList: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] } });
