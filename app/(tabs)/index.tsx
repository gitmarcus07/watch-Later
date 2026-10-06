import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { useGreeting } from '@/features/home/greeting';
import { EmptyState, ErrorView, LoadingView, PosterSkeleton } from '@/components/feedback/FeedbackViews';
import { ContinueWatchingCard } from '@/components/media/ContinueWatchingCard';
import { PosterCard } from '@/components/media/PosterCard';
import { type MediaRowItem } from '@/components/media/MediaRow';
import { SectionHeader } from '@/components/common/SectionHeader';
import type { CatalogMedia } from '@/domain/models/media';
import { CatalogError } from '@/domain/errors/CatalogError';
import { useRecentlyReleased, useTrending } from '@/features/catalog/hooks';
import { useContinueWatching } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { colors, radius, spacing } from '@/theme';

const HOME_SECTION_LIMIT = 15;

function toRowItem(media: CatalogMedia): MediaRowItem {
  const kind = media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'TV series' : 'Anime';
  return { id: mediaRouteId(media), title: media.title, subtitle: [media.year, kind].filter(Boolean).join(' · '), posterUri: media.posterUrl };
}

function DiscoverySection({ title, subtitle, items, isLoading, isError, error, onRetry, onPressItem, emptyMessage }: {
  title: string; subtitle: string; items: MediaRowItem[]; isLoading: boolean; isError: boolean; error: unknown;
  onRetry: () => void; onPressItem: (id: string) => void; emptyMessage: string;
}) {
  return <View style={styles.section}>
    <SectionHeader title={title} subtitle={subtitle} />
    {isLoading && !items.length ? <View style={styles.skeletonRow} accessibilityRole="progressbar" accessibilityLabel={`Loading ${title.toLowerCase()}`}>{[0, 1, 2, 3].map((index) => <PosterSkeleton key={index} />)}</View>
      : isError && !items.length ? <View style={styles.sectionError}><ErrorView message={error instanceof CatalogError ? error.userMessage : emptyMessage} onRetry={onRetry} /></View>
      : <FlatList horizontal data={items} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} renderItem={({ item }) => <PosterCard title={item.title} subtitle={item.subtitle} posterUri={item.posterUri} palette={item.palette} onPress={() => onPressItem(item.id)} />} />}
  </View>;
}

export default function HomeScreen() {
  const router = useRouter();
  const greeting = useGreeting();
  const continueQuery = useContinueWatching();
  const trendingQuery = useTrending();
  const recentQuery = useRecentlyReleased();
  const trendingItems = (trendingQuery.data ?? []).slice(0, HOME_SECTION_LIMIT).map(toRowItem);
  const recentItems = (recentQuery.data ?? []).slice(0, HOME_SECTION_LIMIT).map(toRowItem);
  const openMedia = (id: string) => router.push({ pathname: '/media/[id]', params: { id } });

  return <Screen scroll>
    <View style={styles.header}><View><AppText variant="caption" muted>YOUR PERSONAL CINEMA</AppText><AppText variant="heading1" style={styles.title}>{greeting}</AppText></View><ProfileAvatar /></View>
    <View style={styles.section}><SectionHeader title="Continue Watching" />
      {continueQuery.isLoading ? <LoadingView label="Loading your progress" /> : continueQuery.isError ? <ErrorView message="Couldn't load your progress. Try again." onRetry={() => void continueQuery.refetch()} /> : continueQuery.data?.length ? continueQuery.data.map((item) => <ContinueWatchingCard key={item.media.id} title={item.media.title} posterUri={item.media.posterUrl} subtitle={item.nextEpisode ? `S${item.nextEpisode.seasonNumber} E${item.nextEpisode.episodeNumber} · ${item.nextEpisode.title}` : `Continue with Season ${item.nextSeasonNumber}`} progress={item.progress} palette={['#51416C', '#202637']} onPress={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media), season: String(item.nextEpisode?.seasonNumber ?? item.nextSeasonNumber) } })} />) : <View style={styles.emptyCard}><EmptyState icon="play-circle-outline" title="Nothing in progress" message="Track a TV series and mark episodes watched to pick up right where you left off." actionLabel="Find a series" onAction={() => router.push('/(tabs)/search')} /></View>}
    </View>
    <DiscoverySection title="Trending Now" subtitle="What everyone is watching this week" items={trendingItems} isLoading={trendingQuery.isLoading} isError={trendingQuery.isError} error={trendingQuery.error} onRetry={() => void trendingQuery.refetch()} onPressItem={openMedia} emptyMessage="Trending content will appear when you're back online." />
    <DiscoverySection title="Recently Released" subtitle="New movies and shows airing now" items={recentItems} isLoading={recentQuery.isLoading} isError={recentQuery.isError} error={recentQuery.error} onRetry={() => void recentQuery.refetch()} onPressItem={openMedia} emptyMessage="New releases will appear when you're back online." />
    <View style={styles.discover}><AppText variant="heading3">Discover something new</AppText><AppText variant="bodySmall" muted style={styles.copy}>Search real movie, TV and anime metadata and add the titles you want to track.</AppText><AppButton label="Search the catalog" onPress={() => router.push('/(tabs)/search')} /></View>
  </Screen>;
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.xl, paddingBottom: spacing['2xl'] }, title: { marginTop: spacing.sm }, section: { marginBottom: spacing.xl }, emptyCard: { minHeight: 200, borderRadius: radius.card, backgroundColor: colors.surface, padding: spacing.md }, skeletonRow: { flexDirection: 'row', gap: spacing.md, overflow: 'hidden' }, carousel: { gap: spacing.md, paddingRight: spacing.xl }, sectionError: { minHeight: 200 }, discover: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md, marginBottom: spacing['2xl'] }, copy: { lineHeight: 22 } });
