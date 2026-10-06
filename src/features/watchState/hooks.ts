import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogMedia, CatalogSeason, MediaIdentity } from '@/domain/models/media';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { syncService } from '@/features/sync/SyncService';
import { useSessionStore } from '@/store/app/sessionStore';

export const watchKeys = {
  all: ['watch'] as const,
  watchlist: ['watch', 'watchlist'] as const,
  watched: ['watch', 'watched'] as const,
  progress: ['watch', 'series-progress'] as const,
  continue: ['watch', 'continue'] as const,
  media: (identity: MediaIdentity) => ['watch', 'media', identity.provider, identity.mediaType, identity.providerId] as const,
  episodes: (identity: MediaIdentity, season: number) => ['watch', 'episodes', identity.provider, identity.providerId, season] as const,
};

function useInvalidateWatchState() {
  const queryClient = useQueryClient();
  return (sync = false) => {
    void queryClient.invalidateQueries({ queryKey: watchKeys.all });
    const session = useSessionStore.getState().session;
    if (sync && session.mode === 'authenticated') void syncService.sync(session.userId).catch(() => undefined);
  };
}

export function useWatchlist() {
  return useQuery({ queryKey: watchKeys.watchlist, queryFn: () => watchStateRepository.getWatchlist() });
}

export function useWatchedLibrary() {
  return useQuery({ queryKey: watchKeys.watched, queryFn: () => watchStateRepository.getWatchedLibrary() });
}

export function useSeriesProgress() {
  return useQuery({ queryKey: watchKeys.progress, queryFn: () => watchStateRepository.getSeriesProgress() });
}

export function useContinueWatching() {
  return useQuery({ queryKey: watchKeys.continue, queryFn: () => watchStateRepository.getContinueWatching() });
}

export function useTrackedMedia(identity: MediaIdentity | undefined) {
  return useQuery({
    queryKey: identity ? watchKeys.media(identity) : ['watch', 'media', 'none'],
    queryFn: async () => identity ? (await watchStateRepository.getTrackedMedia(identity)) ?? null : null,
    enabled: Boolean(identity),
  });
}

export function useCachedSeason(identity: MediaIdentity | undefined, seasonNumber: number | undefined) {
  return useQuery({
    queryKey: identity && seasonNumber !== undefined ? ['watch', 'cached-season', identity.provider, identity.providerId, seasonNumber] : ['watch', 'cached-season', 'none'],
    queryFn: async () => identity && seasonNumber !== undefined ? (await watchStateRepository.getCachedSeason(identity, seasonNumber)) ?? null : null,
    enabled: Boolean(identity && seasonNumber !== undefined),
  });
}

export function useLibraryStatuses(items: CatalogMedia[]) {
  const identities = items.map(({ provider, mediaType, providerId }) => ({ provider, mediaType, providerId }));
  const key = identities.map((identity) => `${identity.provider}:${identity.mediaType}:${identity.providerId}`).sort();
  return useQuery({
    queryKey: ['watch', 'statuses', key],
    queryFn: () => watchStateRepository.getLibraryStatuses(identities),
    enabled: identities.length > 0,
  });
}

export function useWatchlistStatus(identity: MediaIdentity | undefined) {
  return useQuery({
    queryKey: identity ? [...watchKeys.media(identity), 'watchlist'] : ['watch', 'watchlist', 'none'],
    queryFn: () => identity ? watchStateRepository.isInWatchlist(identity) : Promise.resolve(false),
    enabled: Boolean(identity),
  });
}

export function useMovieWatchedStatus(identity: MediaIdentity | undefined) {
  return useQuery({
    queryKey: identity ? [...watchKeys.media(identity), 'movie-watched'] : ['watch', 'movie-watched', 'none'],
    queryFn: () => identity ? watchStateRepository.isMovieWatched(identity) : Promise.resolve(false),
    enabled: Boolean(identity?.mediaType === 'movie'),
  });
}

export function useSeriesTrackingStatus(identity: MediaIdentity | undefined) {
  return useQuery({
    queryKey: identity ? [...watchKeys.media(identity), 'tracking'] : ['watch', 'tracking', 'none'],
    queryFn: () => identity ? watchStateRepository.isSeriesTracked(identity) : Promise.resolve(false),
    enabled: Boolean(identity && identity.mediaType !== 'movie'),
  });
}

export function useWatchedEpisodeIds(identity: MediaIdentity | undefined, seasonNumber: number | undefined) {
  return useQuery({
    queryKey: identity && seasonNumber !== undefined ? watchKeys.episodes(identity, seasonNumber) : ['watch', 'episodes', 'none'],
    queryFn: () => identity && seasonNumber !== undefined ? watchStateRepository.getWatchedEpisodeIds(identity, seasonNumber) : Promise.resolve([]),
    enabled: Boolean(identity && seasonNumber !== undefined),
  });
}

export function useToggleWatchlist(media: CatalogMedia) {
  const invalidate = useInvalidateWatchState();
  const state = useWatchlistStatus(media);
  const mutation = useMutation({
    mutationFn: () => state.data ? watchStateRepository.removeFromWatchlist(media) : watchStateRepository.addToWatchlist(media),
    onSuccess: () => invalidate(true),
  });
  return { ...state, toggle: mutation.mutate, toggleAsync: mutation.mutateAsync, isMutating: mutation.isPending };
}

export function useWatchlistMutation(media: CatalogMedia, currentlySaved: boolean) {
  const invalidate = useInvalidateWatchState();
  const mutation = useMutation({
    mutationFn: () => currentlySaved ? watchStateRepository.removeFromWatchlist(media) : watchStateRepository.addToWatchlist(media),
    onSuccess: () => invalidate(true),
  });
  return mutation;
}

export function useMovieWatchedMutation(media: CatalogMedia, currentlyWatched: boolean) {
  const invalidate = useInvalidateWatchState();
  return useMutation({
    mutationFn: () => watchStateRepository.markMovieWatched(media, !currentlyWatched),
    onSuccess: () => invalidate(true),
  });
}

export function useSeriesTrackingMutation(media: CatalogMedia, currentlyTracked: boolean) {
  const invalidate = useInvalidateWatchState();
  return useMutation({
    mutationFn: () => currentlyTracked ? watchStateRepository.stopTrackingSeries(media) : watchStateRepository.startTrackingSeries(media),
    onSuccess: () => invalidate(true),
  });
}

export function useToggleMovieWatched(media: CatalogMedia) {
  const invalidate = useInvalidateWatchState();
  const state = useMovieWatchedStatus(media);
  const mutation = useMutation({
    mutationFn: () => watchStateRepository.markMovieWatched(media, !state.data),
    onSuccess: () => invalidate(true),
  });
  return { ...state, toggle: mutation.mutate, toggleAsync: mutation.mutateAsync, isMutating: mutation.isPending };
}

export function useStartTrackingSeries(media: CatalogMedia) {
  const invalidate = useInvalidateWatchState();
  const state = useSeriesTrackingStatus(media);
  const mutation = useMutation({
    mutationFn: () => state.data ? watchStateRepository.stopTrackingSeries(media) : watchStateRepository.startTrackingSeries(media),
    onSuccess: () => invalidate(true),
  });
  return { ...state, toggle: mutation.mutate, toggleAsync: mutation.mutateAsync, isMutating: mutation.isPending };
}

export function useStoreSeason(media: CatalogMedia) {
  const invalidate = useInvalidateWatchState();
  return useMutation({
    mutationFn: (season: CatalogSeason) => watchStateRepository.storeSeason(media, season.seasonNumber, season.name, season.episodes.length, season.overview, season.airDate, season.posterUrl, season.episodes),
    onSuccess: () => invalidate(false),
  });
}

export function useToggleEpisode(media: CatalogMedia, season: CatalogSeason) {
  const invalidate = useInvalidateWatchState();
  const episodes = useWatchedEpisodeIds(media, season.seasonNumber);
  const mutation = useMutation({
    mutationFn: ({ episode, watched }: { episode: CatalogSeason['episodes'][number]; watched: boolean }) => watchStateRepository.setEpisodeWatched(media, season, episode, watched),
    onSuccess: () => invalidate(true),
  });
  return { ...mutation, watchedIds: episodes.data ?? [], toggle: mutation.mutate, isMutating: mutation.isPending };
}

export function useToggleSeason(media: CatalogMedia, seasonNumber: number) {
  const invalidate = useInvalidateWatchState();
  return useMutation({
    mutationFn: ({ watched, season }: { watched: boolean; season: CatalogSeason }) => watchStateRepository.setSeasonWatched(media, season, watched),
    onSuccess: () => invalidate(true),
  });
}

export function useSetSeriesWatched(media: CatalogMedia) {
  const invalidate = useInvalidateWatchState();
  return useMutation({
    mutationFn: async (watched: boolean) => {
      if (!watched) return watchStateRepository.setSeriesWatched(media, [], false);
      const summaries = media.seasonSummaries ?? [];
      if (!summaries.length) throw new Error('Season metadata is not available for this series.');
      const seasons = await Promise.all(summaries.map(async (summary) => {
        const season = await catalogRepository.getSeason(media, summary.seasonNumber);
        return { ...season, episodeCount: summary.episodeCount };
      }));
      return watchStateRepository.setSeriesWatched(media, seasons, watched);
    },
    onSuccess: () => invalidate(true),
  });
}

export function useWatchStateActions() {
  const invalidate = useInvalidateWatchState();
  return { invalidate };
}
