import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { ContinueWatchingCard } from '@/components/media/ContinueWatchingCard';
import { MediaRow, type MediaRowItem } from '@/components/media/MediaRow';
import { SectionHeader } from '@/components/common/SectionHeader';
import { useContinueWatching, useWatchedLibrary, useWatchlist } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { colors, radius, spacing } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const continueQuery = useContinueWatching();
  const watchlistQuery = useWatchlist();
  const watchedQuery = useWatchedLibrary();
  const watchlistItems: MediaRowItem[] = (watchlistQuery.data ?? []).slice(0, 8).map(({ media }) => ({ id: mediaRouteId(media), title: media.title, subtitle: media.year?.toString(), posterUri: media.posterUrl }));
  const watchedItems: MediaRowItem[] = (watchedQuery.data ?? []).slice(0, 8).map((entry) => {
    const media = entry.kind === 'movie' ? entry.media : entry.progress.media;
    return { id: mediaRouteId(media), title: media.title, subtitle: entry.kind === 'movie' ? 'Watched' : `${entry.progress.watchedEpisodeCount} episodes watched`, posterUri: media.posterUrl };
  });
  const openMedia = (id: string) => router.push({ pathname: '/media/[id]', params: { id } });

  return <Screen scroll>
    <View style={styles.header}><View><AppText variant="caption" muted>YOUR PERSONAL CINEMA</AppText><AppText variant="heading1" style={styles.title}>Good evening.</AppText></View><View style={styles.avatar}><Ionicons name="person-outline" size={20} color={colors.accent} /></View></View>
    <View style={styles.section}><SectionHeader title="Continue Watching" />
      {continueQuery.isLoading ? <LoadingView label="Loading your progress" /> : continueQuery.isError ? <ErrorView message="Couldn't load your progress. Try again." onRetry={() => void continueQuery.refetch()} /> : continueQuery.data?.length ? continueQuery.data.map((item) => <ContinueWatchingCard key={item.media.id} title={item.media.title} posterUri={item.media.posterUrl} subtitle={item.nextEpisode ? `S${item.nextEpisode.seasonNumber} E${item.nextEpisode.episodeNumber} · ${item.nextEpisode.title}` : `Continue with Season ${item.nextSeasonNumber}`} progress={item.progress} palette={['#51416C', '#202637']} onPress={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media), season: String(item.nextEpisode?.seasonNumber ?? item.nextSeasonNumber) } })} />) : <View style={styles.emptyCard}><EmptyState icon="play-circle-outline" title="Nothing in progress" message="Start tracking a TV series to see your next episode here." actionLabel="Find a series" onAction={() => router.push('/(tabs)/search')} /></View>}
    </View>
    <View style={styles.section}>
      {watchlistQuery.isLoading ? <LoadingView label="Loading your watchlist" /> : watchlistQuery.isError ? <><SectionHeader title="Recently Added" /><ErrorView message="Couldn't load your watchlist. Try again." onRetry={() => void watchlistQuery.refetch()} /></> : watchlistItems.length ? <MediaRow title="Recently Added" items={watchlistItems} onSeeAll={() => router.push('/(tabs)/watchlist')} onPressItem={openMedia} /> : <><SectionHeader title="Recently Added" /><View style={styles.inlineEmpty}><EmptyState icon="bookmark-outline" title="Your watchlist is empty" message="Save a movie or series to find it here." actionLabel="Explore titles" onAction={() => router.push('/(tabs)/search')} /></View></>}
    </View>
    <View style={styles.section}>
      {watchedQuery.isLoading ? <LoadingView label="Loading watched titles" /> : watchedQuery.isError ? <><SectionHeader title="Recently Watched" /><ErrorView message="Couldn't load watched titles. Try again." onRetry={() => void watchedQuery.refetch()} /></> : watchedItems.length ? <MediaRow title="Recently Watched" items={watchedItems} onSeeAll={() => router.push('/(tabs)/watched')} onPressItem={openMedia} /> : <><SectionHeader title="Recently Watched" /><View style={styles.inlineEmpty}><EmptyState icon="checkmark-circle-outline" title="Nothing watched yet" message="Movies and episodes you finish will appear here." actionLabel="Find something to watch" onAction={() => router.push('/(tabs)/search')} /></View></>}
    </View>
    <View style={styles.discover}><AppText variant="heading3">Discover something new</AppText><AppText variant="bodySmall" muted style={styles.copy}>Search real movie, TV and anime metadata and add the titles you want to track.</AppText><AppButton label="Search the catalog" onPress={() => router.push('/(tabs)/search')} /></View>
  </Screen>;
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xl, paddingBottom: spacing['2xl'] }, title: { marginTop: spacing.sm }, avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, section: { marginBottom: spacing.xl }, emptyCard: { minHeight: 200, borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.md }, inlineEmpty: { minHeight: 170 }, discover: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md, marginBottom: spacing['2xl'] }, copy: { lineHeight: 22 } });
