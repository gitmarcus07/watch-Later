import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { AppButton } from '@/components/buttons/AppButton';
import { EpisodeList, SeasonSelector } from '@/components/media/EpisodeList';
import { Screen } from '@/components/common/Screen';
import { DetailSkeleton, EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { CatalogError } from '@/domain/errors/CatalogError';
import { useCatalogMedia, useCatalogSeason } from '@/features/catalog/hooks';
import { mediaId, parseMediaRouteId } from '@/features/catalog/mediaIdentity';
import { useCachedSeason, useMovieWatchedStatus, useSeriesProgress, useSeriesTrackingStatus, useSetSeriesWatched, useStoreSeason, useToggleEpisode, useToggleSeason, useTrackedMedia, useWatchlistStatus, useWatchlistMutation, useMovieWatchedMutation, useSeriesTrackingMutation } from '@/features/watchState/hooks';
import type { CatalogMedia, CatalogSeason } from '@/domain/models/media';
import { colors, radius, spacing } from '@/theme';

export default function MediaDetailScreen() {
  const { id, season: seasonParam } = useLocalSearchParams<{ id: string; season?: string }>();
  const router = useRouter();
  const identity = typeof id === 'string' ? parseMediaRouteId(id) : undefined;
  const mediaQuery = useCatalogMedia(identity);
  const localMediaQuery = useTrackedMedia(identity);
  const media = mediaQuery.data ?? localMediaQuery.data;
  const routeSeason = typeof seasonParam === 'string' && /^\d+$/.test(seasonParam) ? Number(seasonParam) : undefined;
  const [selectedSeasonOverride, setSelectedSeasonOverride] = useState<number | undefined>(routeSeason);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const selectedSeason = selectedSeasonOverride ?? media?.seasonSummaries?.[0]?.seasonNumber;
  const seasonQuery = useCatalogSeason(identity, selectedSeason);
  const localSeasonQuery = useCachedSeason(identity, selectedSeason);
  const season = seasonQuery.data ?? localSeasonQuery.data;
  const actionMedia = useMemo<CatalogMedia>(() => media ?? (identity ? { ...identity, id: mediaId(identity), title: '', genres: [], episodeMetadata: identity.provider === 'anilist' ? 'unavailable' : 'available' } : { provider: 'tmdb', mediaType: 'movie', providerId: '', id: '', title: '', genres: [], episodeMetadata: 'unavailable' }), [identity, media]);
  const watchlistStatus = useWatchlistStatus(identity);
  const watchlistMutation = useWatchlistMutation(actionMedia, watchlistStatus.data ?? false);
  const watchedStatus = useMovieWatchedStatus(identity);
  const watchedMutation = useMovieWatchedMutation(actionMedia, watchedStatus.data ?? false);
  const trackingStatus = useSeriesTrackingStatus(identity);
  const trackingMutation = useSeriesTrackingMutation(actionMedia, trackingStatus.data ?? false);
  const seriesProgress = useSeriesProgress();
  const progress = seriesProgress.data?.find((item) => item.media.id === (identity ? mediaId(identity) : undefined));
  const storeSeasonMutation = useStoreSeason(actionMedia);
  const toggleSeasonMutation = useToggleSeason(actionMedia, selectedSeason ?? 0);
  const setSeriesWatchedMutation = useSetSeriesWatched(actionMedia);
  const emptySeason = useMemo<CatalogSeason>(() => ({ series: identity ?? actionMedia, seasonNumber: selectedSeason ?? 0, name: `Season ${selectedSeason ?? 0}`, episodes: [] }), [identity, actionMedia, selectedSeason]);
  const episodeMutation = useToggleEpisode(actionMedia, season ?? emptySeason);

  const saveSeason = storeSeasonMutation.mutate;
  useEffect(() => {
    if (trackingStatus.data && seasonQuery.data) saveSeason(seasonQuery.data);
  }, [trackingStatus.data, seasonQuery.data, saveSeason]);
  useEffect(() => {
    const error = watchlistMutation.error ?? watchedMutation.error ?? trackingMutation.error ?? episodeMutation.error ?? toggleSeasonMutation.error ?? setSeriesWatchedMutation.error ?? storeSeasonMutation.error;
    if (error instanceof Error) Alert.alert('Couldn’t update your library', error.message || 'Try again.');
  }, [watchlistMutation.error, watchedMutation.error, trackingMutation.error, episodeMutation.error, toggleSeasonMutation.error, setSeriesWatchedMutation.error, storeSeasonMutation.error]);

  if (!identity) return <Screen><View style={styles.center}><ErrorView message="This media link is not valid." onRetry={() => router.replace('/(tabs)/search')} /></View></Screen>;
  if (mediaQuery.isLoading && !media) return <Screen><DetailSkeleton /></Screen>;
  if (mediaQuery.isError && !media || !media) {
    const message = mediaQuery.error instanceof CatalogError ? mediaQuery.error.userMessage : 'Could not load this title. Check your connection and try again.';
    return <Screen><View style={styles.center}><ErrorView message={message} onRetry={() => void mediaQuery.refetch()} /></View></Screen>;
  }

  const episodic = media.mediaType !== 'movie';
  const genres = media.genres.map((genre) => genre.name);
  const headingMeta = [media.year, media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'TV series' : media.animeFormat || 'Anime'].filter(Boolean).join(' · ');

  return <Screen><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
    <View style={styles.hero}><LinearGradient colors={['#382F50', colors.background]} style={StyleSheet.absoluteFill} />{media.backdropUrl ? <Image source={{ uri: media.backdropUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}<View style={styles.heroScrim} /><View style={styles.heroTop}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><IconButton name="ellipsis-horizontal" label="More options" onPress={() => undefined} /></View><View style={styles.heroBottom}>{media.posterUrl ? <Image source={{ uri: media.posterUrl }} style={styles.poster} resizeMode="cover" /> : null}<View style={styles.heroTitle}><AppText variant="caption" style={styles.kind}>{media.provider === 'tmdb' ? 'TMDb' : 'ANILIST'}</AppText><AppText variant="heading1">{media.title}</AppText><AppText variant="bodySmall" color="rgba(255,255,255,0.82)">{headingMeta}</AppText></View></View></View>
    <View style={styles.body}>
      <View style={styles.metadata}>{media.rating !== undefined ? <View style={styles.rating}><Ionicons name="star" color={colors.accent} size={16} /><AppText variant="label">{media.rating.toFixed(1)}</AppText></View> : null}{media.runtimeMinutes ? <AppText variant="caption" muted>{media.runtimeMinutes} min</AppText> : null}{media.status ? <AppText variant="caption" muted>{media.status.replaceAll('_', ' ')}</AppText> : null}</View>
      <AppButton label={watchlistStatus.data ? 'Remove from Watchlist' : 'Add to Watchlist'} icon={<Ionicons name={watchlistStatus.data ? 'checkmark' : 'bookmark-outline'} size={18} color={colors.background} />} disabled={watchlistStatus.isLoading || watchlistMutation.isPending} onPress={() => watchlistMutation.mutate()} />
      {media.mediaType === 'movie' ? <AppButton variant="secondary" label={watchedStatus.data ? 'Mark as Unwatched' : 'Mark as Watched'} icon={<Ionicons name={watchedStatus.data ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={colors.accent} />} disabled={watchedStatus.isLoading || watchedMutation.isPending} onPress={() => watchedMutation.mutate()} /> : <View style={styles.trackingActions}><AppButton variant="secondary" label={trackingStatus.data ? 'Stop Tracking' : 'Start Tracking'} icon={<Ionicons name={trackingStatus.data ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={colors.accent} />} disabled={trackingStatus.isLoading || trackingMutation.isPending} onPress={() => trackingMutation.mutate()} />{media.provider === 'anilist' ? <AppText variant="caption" muted>Anime episode tracking is unavailable through AniList metadata.</AppText> : null}{progress ? <AppText variant="caption" muted>{progress.watchedEpisodeCount} watched{progress.totalEpisodeCount ? ` / ${progress.totalEpisodeCount} known episodes` : ` / ${progress.cachedEpisodeCount} loaded episodes`}</AppText> : null}</View>}
      <View style={styles.section}><AppText variant="heading3">Overview</AppText><AppText variant="bodySmall" muted style={styles.overview}>{media.overview || 'Overview is not available for this title.'}</AppText>{genres.length ? <View style={styles.tags}>{genres.map((genre) => <View key={genre} style={styles.tag}><AppText variant="caption" muted>{genre}</AppText></View>)}</View> : null}</View>
      {episodic ? <View style={styles.section}><AppText variant="heading3" style={styles.seasonHeading}>{media.mediaType === 'anime' ? 'Episodes' : 'Seasons & episodes'}</AppText>
        {media.mediaType === 'anime' ? <View style={styles.messageCard}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.messageText}>{media.episodeMetadata === 'unavailable' ? 'Episode-level metadata is not available from AniList for this title.' : `${media.numberOfEpisodes ?? 'Episode'} episodes`}</AppText></View>
          : media.seasonSummaries?.length ? <>
            <SeasonSelector season={media.seasonSummaries.find((item) => item.seasonNumber === selectedSeason)?.name ?? 'Select a season'} onPress={() => setSeasonPickerOpen((open) => !open)} />
            {seasonPickerOpen ? <View style={styles.seasonOptions}>{media.seasonSummaries.map((season) => <AppButton key={season.seasonNumber} label={season.name} variant={selectedSeason === season.seasonNumber ? 'secondary' : 'text'} onPress={() => { setSelectedSeasonOverride(season.seasonNumber); setSeasonPickerOpen(false); }} />)}</View> : null}
            {seasonQuery.isLoading && !localSeasonQuery.data ? <View style={styles.seasonLoading}><LoadingView label="Loading episodes" /></View>
              : seasonQuery.isError && !localSeasonQuery.data ? <View style={styles.seasonError}><ErrorView message={seasonQuery.error instanceof CatalogError ? seasonQuery.error.userMessage : 'Could not load this season. Check your connection and try again.'} onRetry={() => void seasonQuery.refetch()} /></View>
              : season?.episodes.length ? <>
                {media.provider === 'tmdb' ? <View style={styles.seasonActions}><AppButton variant="secondary" label={season.episodes.every((episode) => episodeMutation.watchedIds.includes(episode.providerId)) ? 'Mark Season Unwatched' : 'Mark Season Watched'} disabled={toggleSeasonMutation.isPending} onPress={() => toggleSeasonMutation.mutate({ watched: !season.episodes.every((episode) => episodeMutation.watchedIds.includes(episode.providerId)), season })} /><AppButton variant="text" label={progress?.watchedEpisodeCount ? 'Mark Series Unwatched' : 'Mark Series Watched'} loading={setSeriesWatchedMutation.isPending} onPress={() => setSeriesWatchedMutation.mutate(!(progress?.watchedEpisodeCount && progress.watchedEpisodeCount > 0))} /></View> : null}
                <EpisodeList episodes={season.episodes} watchedIds={episodeMutation.watchedIds} disabled={episodeMutation.isPending || media.provider !== 'tmdb'} onToggleEpisode={(episode, watched) => episodeMutation.toggle({ episode, watched })} />
              </>
              : <View style={styles.noEpisodes}><EmptyState icon="list-outline" title="No episodes listed" message="This season does not have episode metadata available." /></View>}
          </> : <View style={styles.messageCard}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.messageText}>Season metadata is not available for this title.</AppText></View>}
      </View> : null}
      {media.studios?.length ? <View style={styles.section}><AppText variant="heading3">Studios</AppText><AppText variant="bodySmall" muted style={styles.overview}>{media.studios.join(' · ')}</AppText></View> : null}
    </View>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ center: { flex: 1 }, scroll: { paddingBottom: spacing['2xl'] }, hero: { height: 350, marginHorizontal: -spacing.xl, padding: spacing.xl, justifyContent: 'space-between', overflow: 'hidden', backgroundColor: colors.surfaceElevated }, heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,6,10,0.34)' }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }, poster: { width: 74, height: 108, borderRadius: radius.small, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: colors.surfaceElevated }, heroTitle: { flex: 1, gap: spacing.sm, paddingBottom: spacing.sm }, kind: { color: colors.accent, letterSpacing: 1.4 }, body: { paddingTop: spacing.lg, gap: spacing.md }, metadata: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, flexWrap: 'wrap' }, rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill }, section: { marginTop: spacing['2xl'] }, overview: { marginTop: spacing.md, lineHeight: 23 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }, tag: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, seasonHeading: { marginBottom: spacing.md }, seasonOptions: { marginBottom: spacing.md }, seasonActions: { gap: spacing.sm, marginBottom: spacing.md }, trackingActions: { gap: spacing.sm }, seasonLoading: { height: 120 }, seasonError: { minHeight: 150 }, noEpisodes: { minHeight: 200 }, messageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.medium, padding: spacing.lg, backgroundColor: colors.surface }, messageText: { flex: 1 } });
