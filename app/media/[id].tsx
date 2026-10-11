import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openURL } from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { AppButton } from '@/components/buttons/AppButton';
import { DetailActions } from '@/components/media/DetailActions';
import { WatchLaterSheet } from '@/components/media/WatchLaterSheet';
import { FadeInView } from '@/components/common/FadeInView';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic } from '@/lib/haptics';
import { SeasonsSection } from '@/components/media/SeasonsSection';
import { OttReleaseSection } from '@/components/media/OttReleaseSection';
import { Screen } from '@/components/common/Screen';
import { DetailSkeleton, ErrorView } from '@/components/feedback/FeedbackViews';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { CatalogError } from '@/domain/errors/CatalogError';
import { useCatalogMedia, useContentRating, useMediaCredits, useTmdbEnrichment, useTrailerKey, useWatchProviders } from '@/features/catalog/hooks';
import { countryName, languageName } from '@/features/catalog/metaNames';
import { mediaId, parseMediaRouteId } from '@/features/catalog/mediaIdentity';
import { isUpcoming, formatReleaseDate } from '@/features/catalog/upcoming';
import { finishTitle } from '@/features/watchState/status';
import { PRIORITY_META } from '@/features/watchState/priority';
import type { WatchPriority } from '@/domain/models/watchState';
import { useFavoriteMutation, useFavoriteStatus, useMovieWatchedStatus, useSaveToWatchlist, useSeriesProgress, useSeriesTrackingStatus, useTrackedMedia, useWatchlist, useWatchlistStatus, useWatchlistMutation, useMovieWatchedMutation, useSeriesTrackingMutation } from '@/features/watchState/hooks';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { scheduleAutoSync } from '@/features/sync/autoSync';
import { queryClient } from '@/lib/query/queryClient';
import type { CatalogMedia } from '@/domain/models/media';
import { colors, radius, spacing } from '@/theme';

export default function MediaDetailScreen() {
  const { id, season: seasonParam } = useLocalSearchParams<{ id: string; season?: string }>();
  const router = useRouter();
  const identity = typeof id === 'string' ? parseMediaRouteId(id) : undefined;
  const mediaQuery = useCatalogMedia(identity);
  const localMediaQuery = useTrackedMedia(identity);
  const media = mediaQuery.data ?? localMediaQuery.data;
  const routeSeason = typeof seasonParam === 'string' && /^\d+$/.test(seasonParam) ? Number(seasonParam) : undefined;
  const actionMedia = useMemo<CatalogMedia>(() => media ?? (identity ? { ...identity, id: mediaId(identity), title: '', genres: [], episodeMetadata: identity.provider === 'anilist' ? 'unavailable' : 'available' } : { provider: 'tmdb', mediaType: 'movie', providerId: '', id: '', title: '', genres: [], episodeMetadata: 'unavailable' }), [identity, media]);
  const watchlistStatus = useWatchlistStatus(identity);
  const watchlistMutation = useWatchlistMutation(actionMedia, watchlistStatus.data ?? false);
  const favoriteStatus = useFavoriteStatus(identity);
  const favoriteMutation = useFavoriteMutation(actionMedia, favoriteStatus.data ?? false);
  const watchedStatus = useMovieWatchedStatus(identity);
  const watchedMutation = useMovieWatchedMutation(actionMedia, watchedStatus.data ?? false);
  const trackingStatus = useSeriesTrackingStatus(identity);
  const trackingMutation = useSeriesTrackingMutation(actionMedia, trackingStatus.data ?? false);
  const saveToWatchlistMutation = useSaveToWatchlist(actionMedia);
  const watchlistQuery = useWatchlist();
  const savedPriority: WatchPriority | null = watchlistQuery.data?.find((entry) => entry.media.id === actionMedia.id)?.priority ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const seriesProgress = useSeriesProgress();
  const progress = seriesProgress.data?.find((item) => item.media.id === (identity ? mediaId(identity) : undefined));
  const trailerQuery = useTrailerKey(identity);
  const providersQuery = useWatchProviders(identity);
  const creditsQuery = useMediaCredits(identity);
  const contentRatingQuery = useContentRating(identity);
  const enrichment = useTmdbEnrichment(media);
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  async function markSeriesFinished(): Promise<void> {
    if (!media || media.mediaType === 'movie' || statusBusy) return;
    triggerMediumHaptic();
    setStatusBusy(true);
    try {
      await finishTitle(actionMedia);
      triggerSuccessHaptic();
      void queryClient.invalidateQueries({ queryKey: ['watch'] });
      scheduleAutoSync('mutation');
      showToast('Marked whole show as watched', 'success');
    } catch (error) { void showDialog({ type: 'error', title: 'Couldn’t mark as finished', message: friendlyErrorMessage(error) }); }
    finally { setStatusBusy(false); }
  }

  async function markSeriesUnwatched(): Promise<void> {
    if (!media || media.mediaType === 'movie' || statusBusy) return;
    const confirmed = await showDialog({
      type: 'warning', title: 'Mark whole series unwatched?',
      message: 'All episode watches for this title will be cleared so you can start over.',
      primaryAction: { label: 'Clear progress' }, secondaryAction: { label: 'Keep as is' },
    });
    if (!confirmed) return;
    setStatusBusy(true);
    try {
      if (media.episodeMetadata === 'available') await watchStateRepository.setSeriesWatched(media, [], false);
      else await watchStateRepository.setSeriesComplete(media, false);
      void queryClient.invalidateQueries({ queryKey: ['watch'] });
      scheduleAutoSync('mutation');
    } catch (error) { void showDialog({ type: 'error', title: 'Couldn’t clear progress', message: friendlyErrorMessage(error) }); }
    finally { setStatusBusy(false); }
  }

  useEffect(() => {
    const error = watchlistMutation.error ?? watchedMutation.error ?? trackingMutation.error ?? favoriteMutation.error ?? saveToWatchlistMutation.error;
    if (error) void showDialog({ type: 'error', title: 'Couldn’t update your library', message: friendlyErrorMessage(error) });
  }, [watchlistMutation.error, watchedMutation.error, trackingMutation.error, favoriteMutation.error, saveToWatchlistMutation.error]);

  if (!identity) return <Screen><View style={styles.center}><ErrorView message="This media link is not valid." onRetry={() => router.replace('/search')} /></View></Screen>;
  if (mediaQuery.isLoading && !media) return <Screen><DetailSkeleton /></Screen>;
  if (mediaQuery.isError && !media || !media) {
    const message = mediaQuery.error instanceof CatalogError ? mediaQuery.error.userMessage : 'Could not load this title. Check your connection and try again.';
    return <Screen><View style={styles.center}><ErrorView message={message} onRetry={() => void mediaQuery.refetch()} /></View></Screen>;
  }

  const episodic = media.mediaType !== 'movie';
  const genres = media.genres.map((genre) => genre.name);
  const kindLabel = media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'TV series' : media.animeFormat || 'Anime';
  const runtimeLabel = media.runtimeMinutes ? (media.runtimeMinutes >= 60 ? `${Math.floor(media.runtimeMinutes / 60)}h ${media.runtimeMinutes % 60 ? `${media.runtimeMinutes % 60}m` : ''}`.trim() : `${media.runtimeMinutes}m`) : undefined;
  const headingMeta = [kindLabel, media.year, runtimeLabel].filter(Boolean).join(' • ');
  // TVDB titles carry cast, directors, and age ratings in the detail payload;
  // legacy provider titles resolve them through the metadata hooks below.
  const trailerKey = media.trailerKey ?? trailerQuery.data;
  const directors = (media.directors ?? creditsQuery.data ?? []).join(', ');
  const directorCell = directors ? { label: 'Directed By', value: directors }
    : media.mediaType === 'anime' && media.studios?.length ? { label: 'Studio', value: media.studios[0] }
    : undefined;
  const infoItems = [
    directorCell,
    { label: 'Country', value: countryName(media.originCountries?.[0]) },
    { label: 'Language', value: languageName(media.language) },
    { label: 'Age Rating', value: media.contentRating ?? contentRatingQuery.data ?? undefined },
  ].filter((item): item is { label: string; value: string } => Boolean(item?.value)).slice(0, 4);

  const primaryBusy = statusBusy || watchedMutation.isPending;
  const watched = media.mediaType === 'movie' ? watchedStatus.data : progress?.isComplete;
  // TMDb score bridged through TVDB's own remote IDs; legacy titles already
  // carry their score in the base payload.
  const score = enrichment.data?.rating ?? (media.provider !== 'tvdb' ? media.rating : undefined);
  const scoreVotes = enrichment.data?.voteCount ?? (media.provider !== 'tvdb' ? media.voteCount : undefined);
  const providerGroups = providersQuery.data ?? enrichment.data?.providers ?? [];
  // Unreleased titles (e.g. announced blockbusters in Browse) can be
  // watchlisted and favorited, but never marked watched before release.
  const upcoming = isUpcoming(media);
  const releaseLabel = formatReleaseDate(media.releaseDate);
  const primaryLabel = upcoming ? (releaseLabel ? `Coming ${releaseLabel}` : 'Not released yet') : watched ? 'Watched' : 'Mark as Watched';
  const primaryIcon = watched && !upcoming ? 'eye' as const : upcoming ? 'calendar-outline' as const : 'eye-outline' as const;

  function handlePrimary() {
    if (!media || primaryBusy || upcoming) return;
    triggerMediumHaptic();
    if (media.mediaType === 'movie') {
      watchedMutation.mutate(undefined, {
        onSuccess: () => { triggerSuccessHaptic(); if (!watchedStatus.data) showToast('Marked as watched', 'success'); },
        onError: (error) => void showDialog({ type: 'error', title: 'Couldn’t mark as watched', message: friendlyErrorMessage(error) }),
      });
      return;
    }
    if (watched) {
      void markSeriesUnwatched();
      return;
    }
    void markSeriesFinished();
  }

  function handleSavePriority(priority: WatchPriority) {
    triggerLightHaptic();
    saveToWatchlistMutation.mutate(priority, {
      onSuccess: () => {
        triggerSuccessHaptic();
        setSheetOpen(false);
        showToast(`Saved to Watchlist · ${PRIORITY_META[priority].label}`, 'success');
      },
      onError: (error) => void showDialog({ type: 'error', title: 'Couldn’t save to watchlist', message: friendlyErrorMessage(error) }),
    });
  }

  function handleRemoveFromWatchlist() {
    triggerLightHaptic();
    watchlistMutation.mutate(undefined, {
      onSuccess: () => {
        setSheetOpen(false);
        showToast('Removed from watchlist', 'info');
      },
      onError: (error) => void showDialog({ type: 'error', title: 'Couldn’t update your watchlist', message: friendlyErrorMessage(error) }),
    });
  }

  return <Screen><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
    <View style={styles.hero}>
      <LinearGradient colors={['#241D33', colors.background]} style={StyleSheet.absoluteFill} />
      {media.backdropUrl && !backdropFailed ? <Image source={{ uri: media.backdropUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBackdropFailed(true)} /> : null}
      <View style={styles.heroScrim} />
      <View style={styles.heroTop}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /></View>
      {trailerKey ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Play trailer" onPress={() => void openURL(`https://www.youtube.com/watch?v=${trailerKey}`)} style={({ pressed }) => [styles.playButton, pressed && styles.playPressed]}>
          <Ionicons name="play" size={28} color={colors.white} />
        </Pressable>
      ) : null}
      <View style={styles.heroBottom}>
        {media.posterUrl && !posterFailed ? <Image source={{ uri: media.posterUrl }} style={styles.poster} resizeMode="cover" onError={() => setPosterFailed(true)} /> : <View style={[styles.poster, styles.posterFallback]}><Ionicons name="film-outline" size={24} color={colors.accent} /></View>}
        <View style={styles.heroTitle}>
          <AppText variant="bodySmall" muted>{headingMeta}</AppText>
          <AppText variant="heading1" style={styles.title}>{media.title}</AppText>
          {typeof score === 'number' ? <View style={styles.ratingRow} accessibilityRole="text" accessibilityLabel={`Rated ${score.toFixed(1)} out of 10${typeof scoreVotes === 'number' ? ` from ${scoreVotes} votes` : ''}`}><Ionicons name="star" size={13} color={colors.accent} /><AppText variant="bodySmall" style={styles.ratingText}>{score.toFixed(1)}</AppText>{typeof scoreVotes === 'number' ? <AppText variant="caption" muted>({scoreVotes >= 1000000 ? `${(scoreVotes / 1000000).toFixed(1)}M` : scoreVotes >= 1000 ? `${(scoreVotes / 1000).toFixed(1)}k` : `${scoreVotes}`})</AppText> : null}</View> : null}
          <AppText variant="caption" style={styles.kind}>{media.provider === 'tmdb' ? 'TMDb' : media.provider === 'tvdb' ? 'TVDB' : 'ANILIST'}</AppText>
        </View>
      </View>
    </View>
    <FadeInView style={styles.body}>
      {infoItems.length ? (
        <View style={styles.infoGrid}>
          {infoItems.map((item) => (
            <View key={item.label} style={styles.infoCell}>
              <AppText variant="caption" muted>{item.label}</AppText>
              <AppText variant="bodyMedium" style={styles.infoValue} numberOfLines={1}>{item.value}</AppText>
            </View>
          ))}
        </View>
      ) : null}
      {upcoming ? <View style={styles.messageCard}><Ionicons name="calendar-outline" size={19} color={colors.accent} /><AppText variant="bodySmall" muted style={styles.messageText}>Releases{releaseLabel ? ` ${releaseLabel}` : ' soon'} — save it to your Watchlist, then mark it watched after release.</AppText></View> : null}
      <DetailActions
        primaryLabel={primaryLabel}
        primaryIcon={primaryIcon}
        primaryActive={watched && !upcoming}
        primaryBusy={primaryBusy || upcoming}
        onPrimary={handlePrimary}
        secondary={[
          {
            id: 'watch-later',
            label: watchlistStatus.data ? (savedPriority ? PRIORITY_META[savedPriority].label : 'Watchlisted') : 'Watch Later',
            icon: 'time-outline',
            activeIcon: 'checkmark',
            active: watchlistStatus.data ?? false,
            busy: watchlistStatus.isLoading || watchlistMutation.isPending || saveToWatchlistMutation.isPending,
            onPress: () => { triggerLightHaptic(); setSheetOpen(true); },
            accessibilityLabel: 'Open watch later options',
          },
          {
            id: 'favorite',
            label: 'Favorite',
            icon: 'heart-outline',
            activeIcon: 'heart',
            active: favoriteStatus.data ?? false,
            busy: favoriteStatus.isLoading || favoriteMutation.isPending,
            onPress: () => { triggerLightHaptic(); favoriteMutation.mutate(undefined, {
              onSuccess: () => { triggerSuccessHaptic(); if (!favoriteStatus.data) showToast('Added to favorites', 'success'); },
              onError: (error) => void showDialog({ type: 'error', title: 'Couldn’t update favorites', message: friendlyErrorMessage(error) }),
            }); },
            accessibilityLabel: favoriteStatus.data ? 'Remove from favorites' : 'Add to favorites',
          },
          ...(episodic ? [{
            id: 'tracking',
            label: trackingStatus.data ? 'Tracking' : 'Track Show',
            icon: 'play-outline' as const,
            activeIcon: 'pause-circle' as const,
            active: trackingStatus.data ?? false,
            busy: trackingStatus.isLoading || trackingMutation.isPending,
            onPress: () => { triggerLightHaptic(); trackingMutation.mutate(undefined, {
              onSuccess: () => { triggerSuccessHaptic(); showToast(trackingStatus.data ? 'Stopped tracking' : 'Tracking started', 'info'); },
              onError: (error: unknown) => void showDialog({ type: 'error', title: 'Couldn’t update tracking', message: friendlyErrorMessage(error) }),
            }); },
            accessibilityLabel: trackingStatus.data ? 'Stop tracking this show' : 'Start tracking this show',
          }] : []),
        ]}
      />
      <WatchLaterSheet
        visible={sheetOpen}
        saved={watchlistStatus.data ?? false}
        currentPriority={savedPriority}
        busy={saveToWatchlistMutation.isPending || watchlistMutation.isPending}
        onSelect={handleSavePriority}
        onRemove={handleRemoveFromWatchlist}
        onClose={() => setSheetOpen(false)}
      />
      {progress && episodic ? <AppText variant="caption" muted>{progress.watchedEpisodeCount} watched{progress.totalEpisodeCount ? ` / ${progress.totalEpisodeCount} known episodes` : progress.cachedEpisodeCount ? ` / ${progress.cachedEpisodeCount} loaded episodes` : ''}</AppText> : null}
      <View style={styles.section}><AppText variant="heading3">Overview</AppText><AppText variant="bodySmall" muted style={styles.overview}>{media.overview || 'Overview is not available for this title.'}</AppText>{genres.length ? <View style={styles.tags}>{genres.map((genre) => <View key={genre} style={styles.tag}><AppText variant="bodySmall" style={styles.tagText}>{genre}</AppText></View>)}</View> : null}</View>
      {trailerKey || media.imdbId ? <View style={styles.extras}>{trailerKey ? <AppButton variant="secondary" label="Watch trailer" icon={<Ionicons name="play" size={16} color={colors.accent} />} onPress={() => void openURL(`https://www.youtube.com/watch?v=${trailerKey}`)} /> : null}{media.imdbId ? <AppButton variant="text" label="Open IMDb" onPress={() => void openURL(`https://www.imdb.com/title/${media.imdbId}/`)} /> : null}</View> : null}
      {media.cast?.length ? <View style={styles.section}><AppText variant="heading3">Top cast</AppText><FlatList horizontal data={media.cast.slice(0, 12)} keyExtractor={(item, index) => `${item.name}-${index}`} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.castRow} renderItem={({ item }) => (
        <View style={styles.castCard} accessibilityRole="text" accessibilityLabel={`${item.name}${item.character ? ` as ${item.character}` : ''}`}>
          {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.castPhoto} resizeMode="cover" /> : <View style={[styles.castPhoto, styles.castFallback]}><Ionicons name="person-outline" size={20} color={colors.textMuted} /></View>}
          <AppText variant="bodySmall" numberOfLines={1} style={styles.castName}>{item.name}</AppText>
          {item.character ? <AppText variant="caption" muted numberOfLines={1}>{item.character}</AppText> : null}
        </View>
      )} /></View> : null}
      {providerGroups.length ? <View style={styles.section}><AppText variant="heading3" style={styles.seasonHeading}>Where to watch</AppText>{providerGroups.map((group) => <View key={group.category} style={styles.providerGroup}><AppText variant="caption" muted style={styles.providerCategory}>{group.category === 'stream' ? 'Stream' : group.category === 'rent' ? 'Rent' : 'Buy'}</AppText><View style={styles.providerRow}>{group.providers.map((provider) => <View key={provider.id} style={styles.provider} accessibilityRole="image" accessibilityLabel={provider.name}>{provider.logoUrl ? <Image source={{ uri: provider.logoUrl }} style={styles.providerLogo} resizeMode="cover" /> : <AppText variant="caption">{provider.name.slice(0, 2).toUpperCase()}</AppText>}</View>)}</View></View>)}</View> : null}
      <OttReleaseSection media={media} />
      {episodic ? <View style={styles.section}><AppText variant="heading3" style={styles.seasonHeading}>Seasons & episodes</AppText>
        {progress?.nextEpisode ? <View style={styles.messageCard}><Ionicons name="play-circle-outline" size={19} color={colors.accent} /><AppText variant="bodySmall" muted style={styles.messageText}>Up next: S{progress.nextEpisode.seasonNumber} E{progress.nextEpisode.episodeNumber} · {progress.nextEpisode.title}</AppText></View> : null}
        <SeasonsSection media={media} progress={progress} initialSeasonNumber={routeSeason} />
      </View> : null}
      {media.studios?.length ? <View style={styles.section}><AppText variant="heading3">Studios</AppText><AppText variant="bodySmall" muted style={styles.overview}>{media.studios.join(' · ')}</AppText></View> : null}
    </FadeInView>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ center: { flex: 1 }, scroll: { paddingBottom: spacing['2xl'] }, hero: { height: 380, marginHorizontal: -spacing.xl, padding: spacing.xl, justifyContent: 'space-between', overflow: 'hidden', backgroundColor: colors.surface }, heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,6,10,0.45)' }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }, playButton: { position: 'absolute', top: '42%', left: '50%', marginLeft: -28, width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(10,10,12,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }, playPressed: { opacity: 0.8 }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }, poster: { width: 110, height: 160, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: colors.surfaceElevated }, posterFallback: { alignItems: 'center', justifyContent: 'center' }, heroTitle: { flex: 1, gap: spacing.xs, paddingBottom: spacing.sm }, title: { color: colors.white }, kind: { color: colors.textMuted, letterSpacing: 1.4 }, body: { paddingTop: spacing.lg, gap: spacing.md }, infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm }, infoCell: { flexBasis: '47%', flexGrow: 1, gap: 2 }, infoValue: { color: colors.white }, metadata: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, flexWrap: 'wrap' }, rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill }, section: { marginTop: spacing['2xl'] }, overview: { marginTop: spacing.md, lineHeight: 23 }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }, tag: { backgroundColor: colors.surfaceElevated, borderRadius: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, tagText: { color: colors.textPrimary }, seasonHeading: { marginBottom: spacing.md }, seasonOptions: { marginBottom: spacing.md }, seasonActions: { gap: spacing.sm, marginBottom: spacing.md }, trackingActions: { gap: spacing.sm }, seasonLoading: { height: 120 }, seasonError: { minHeight: 150 }, noEpisodes: { minHeight: 200 }, messageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.medium, padding: spacing.lg, backgroundColor: colors.surface }, messageText: { flex: 1 }, extras: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, providerGroup: { gap: spacing.sm, marginTop: spacing.md }, providerCategory: { letterSpacing: 1 }, providerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, provider: { width: 46, height: 46, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, providerLogo: { width: 44, height: 44, borderRadius: radius.small }, ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, ratingText: { color: colors.white }, castRow: { gap: spacing.md, paddingRight: spacing.xl, marginTop: spacing.md }, castCard: { width: 84, gap: spacing.xs }, castPhoto: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }, castFallback: { alignItems: 'center', justifyContent: 'center' }, castName: { color: colors.white } });
