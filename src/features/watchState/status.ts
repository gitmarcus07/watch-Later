import { AppError } from '@/domain/errors/AppError';
import type { CatalogMedia, CatalogSeason, MediaIdentity } from '@/domain/models/media';
import type { WatchStateRepository } from '@/domain/models/watchState';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';

export type TitleStatus = 'none' | 'plan' | 'watching' | 'finished';

export function getMovieStatus(input: { watchlisted: boolean; movieWatched: boolean }): TitleStatus {
  if (input.movieWatched) return 'finished';
  if (input.watchlisted) return 'plan';
  return 'none';
}

export function getSeriesStatus(input: { watchlisted: boolean; tracking: boolean; complete: boolean }): TitleStatus {
  if (input.complete) return 'finished';
  if (input.tracking) return 'watching';
  if (input.watchlisted) return 'plan';
  return 'none';
}

export const STATUS_LABELS: Record<TitleStatus, string> = {
  none: 'Not tracked',
  plan: 'Plan to Watch',
  watching: 'Watching',
  finished: 'Finished',
};

interface ProgressContext {
  getFullMedia: (identity: MediaIdentity) => Promise<CatalogMedia>;
  getSeason: (identity: MediaIdentity, seasonNumber: number) => Promise<CatalogSeason>;
  repo?: Pick<WatchStateRepository, 'markMovieWatched' | 'startTrackingSeries' | 'storeSeason' | 'setSeriesWatched' | 'setSeriesComplete' | 'getCachedSeason' | 'markEpisodesUpTo'>;
}

const defaultContext = (): ProgressContext => ({
  getFullMedia: (identity) => catalogRepository.getMedia(identity),
  getSeason: (identity, seasonNumber) => catalogRepository.getSeason(identity, seasonNumber),
  repo: watchStateRepository,
});

/**
 * One-tap "Already seen": movies finish instantly; series and anime fetch
 * their real season metadata first and then finish every episode. Anime
 * without any episode data falls back to a completion flag (never invented).
 */
export async function finishTitle(media: CatalogMedia, context: ProgressContext = defaultContext()): Promise<void> {
  const repo = context.repo ?? watchStateRepository;
  if (media.mediaType === 'movie') {
    await repo.markMovieWatched(media, true);
    return;
  }
  if (media.provider === 'anilist' && media.mediaType === 'anime') {
    try {
      const full = await context.getFullMedia(media);
      const summaries = full.seasonSummaries ?? [];
      if (!summaries.length) throw new AppError('catalog', "Episode information isn't available for this title.");
      const seasons: { seasonNumber: number; name: string; episodeCount?: number; overview?: string; airDate?: string; posterUrl?: string; episodes: CatalogSeason['episodes'] }[] = [];
      for (const summary of summaries) {
        try {
          const season = await context.getSeason(full, summary.seasonNumber);
          if (season.episodes.length) seasons.push({ ...season, episodeCount: summary.episodeCount });
        } catch {
          // One unreachable season must not block the rest.
        }
      }
      if (!seasons.length) throw new AppError('catalog', "Episode information isn't available for this title.");
      await repo.setSeriesWatched(full, seasons, true);
      return;
    } catch (error) {
      if (error instanceof AppError && error.kind !== 'catalog') throw error;
      // No episode data anywhere: track + flag complete instead of failing.
      await repo.startTrackingSeries(media);
      await repo.setSeriesComplete(media, true);
      return;
    }
  }
  if (media.provider === 'tvdb') {
    // TVDB seasons are official aired-order rows for shows and anime alike.
    const full = media.seasonSummaries?.length ? media : await context.getFullMedia(media);
    const summaries = full.seasonSummaries ?? [];
    if (!summaries.length) throw new AppError('catalog', "Episode information isn't available for this title.");
    const seasons = await Promise.all(summaries.map(async (summary) => {
      const season = await context.getSeason(full, summary.seasonNumber);
      return { ...season, episodeCount: summary.episodeCount };
    }));
    await repo.setSeriesWatched(full, seasons, true);
    return;
  }
  if (media.provider !== 'tmdb' || media.mediaType !== 'series') {
    await repo.startTrackingSeries(media);
    await repo.setSeriesComplete(media, true);
    return;
  }
  const full = await context.getFullMedia(media);
  const summaries = full.seasonSummaries ?? [];
  if (!summaries.length) throw new AppError('catalog', "Episode information isn't available for this title.");
  const seasons = await Promise.all(summaries.map(async (summary) => {
    const season = await context.getSeason(full, summary.seasonNumber);
    return { ...season, episodeCount: summary.episodeCount };
  }));
  await repo.setSeriesWatched(full, seasons, true);
}

/**
 * "I'm up to here": marks every cached episode at or before the position as
 * watched, fetching and caching the season first when it is missing.
 */
export async function markUpToHere(media: CatalogMedia, seasonNumber: number, episodeNumber: number, context: ProgressContext = defaultContext()): Promise<void> {
  const repo = context.repo ?? watchStateRepository;
  const isTmdbSeries = media.provider === 'tmdb' && media.mediaType === 'series';
  const isAnime = media.provider === 'anilist' && media.mediaType === 'anime';
  const isTvdbSeries = media.provider === 'tvdb' && media.mediaType !== 'movie';
  if (!isTmdbSeries && !isAnime && !isTvdbSeries) throw new AppError('catalog', "Episode information isn't available for this title.");
  if (!Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || !Number.isSafeInteger(episodeNumber) || episodeNumber < 1) {
    throw new AppError('validation', 'Enter a valid season and episode number.');
  }
  const identity: MediaIdentity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId };
  let season = await repo.getCachedSeason(identity, seasonNumber);
  if (!season || season.episodes.length < episodeNumber) {
    const full = await context.getFullMedia(identity);
    const fetched = await context.getSeason(identity, seasonNumber);
    await repo.storeSeason(full, fetched.seasonNumber, fetched.name, fetched.episodes.length, fetched.overview, fetched.airDate, fetched.posterUrl, fetched.episodes);
    season = (await repo.getCachedSeason(identity, seasonNumber)) ?? fetched;
  }
  await repo.markEpisodesUpTo(media, season, episodeNumber);
}
