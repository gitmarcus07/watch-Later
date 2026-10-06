import { AppError } from '@/domain/errors/AppError';
import type { CatalogMedia, MediaEpisode } from '@/domain/models/media';
import type { CloudWatchStateRepository, PendingWatchStateChange } from '@/domain/models/watchState';
import { mediaId } from '@/features/catalog/mediaIdentity';
import { supabase, type Json } from './client';

function client() {
  if (!supabase) throw new AppError('configuration', 'Cloud sync is not configured on this device.');
  return supabase;
}

function parseArray<T>(value: Json, fallback: T[]): T[] {
  return Array.isArray(value) ? value as unknown as T[] : fallback;
}

export class SupabaseWatchStateRepository implements CloudWatchStateRepository {
  async getAuthenticatedUserId(): Promise<string | undefined> {
    const { data, error } = await client().auth.getSession();
    if (error) throw new AppError('authentication', 'Your account session needs to be refreshed. Sign in again to sync.');
    return data.session?.user.id;
  }

  async fetch(userId: string): Promise<PendingWatchStateChange[]> {
    const supabaseClient = client();
    const [mediaResult, watchlistResult, movieResult, seriesResult, episodeResult, favoriteResult] = await Promise.all([
      supabaseClient.from('library_media').select('*').eq('user_id', userId),
      supabaseClient.from('watchlist_entries').select('*').eq('user_id', userId),
      supabaseClient.from('movie_watches').select('*').eq('user_id', userId),
      supabaseClient.from('tracked_series').select('*').eq('user_id', userId),
      supabaseClient.from('episode_watches').select('*').eq('user_id', userId),
      supabaseClient.from('favorite_entries').select('*').eq('user_id', userId),
    ]);
    if (mediaResult.error || watchlistResult.error || movieResult.error || seriesResult.error || episodeResult.error || favoriteResult.error) {
      throw new AppError('network', 'Could not download your synced library. Your local data is safe.');
    }
    const mediaRows = mediaResult.data;
    const mediaByIdentity = new Map<string, CatalogMedia>();
    for (const row of mediaRows) {
      if (!['tmdb', 'anilist'].includes(row.provider) || !['movie', 'series', 'anime'].includes(row.media_type)) continue;
      const media: CatalogMedia = {
        id: mediaId({ provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id }),
        provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id,
        title: row.title, originalTitle: row.original_title ?? undefined, overview: row.overview ?? undefined,
        posterUrl: row.poster_url ?? undefined, backdropUrl: row.backdrop_url ?? undefined, releaseDate: row.release_date ?? undefined,
        year: row.year ?? undefined, genres: parseArray(row.genres, []), numberOfSeasons: row.number_of_seasons ?? undefined,
        numberOfEpisodes: row.number_of_episodes ?? undefined, seasonSummaries: parseArray(row.season_summaries, []),
        episodeMetadata: row.episode_metadata === 'available' ? 'available' : 'unavailable',
      };
      mediaByIdentity.set(media.id, media);
    }
    const changes: PendingWatchStateChange[] = [];
    const append = (change: PendingWatchStateChange) => { if (change.media) changes.push(change); };
    for (const row of watchlistResult.data) {
      const media = mediaByIdentity.get(mediaId({ provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id }));
      if (media) append({ id: -1, entityType: 'watchlist', entityKey: media.id, provider: media.provider, mediaType: media.mediaType, providerId: media.providerId, deleted: row.is_deleted, updatedAt: row.updated_at, media, watchedAt: row.added_at, retryCount: 0 });
    }
    for (const row of movieResult.data) {
      const media = mediaByIdentity.get(mediaId({ provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id }));
      if (media) append({ id: -1, entityType: 'movie', entityKey: media.id, provider: media.provider, mediaType: media.mediaType, providerId: media.providerId, deleted: row.is_deleted, updatedAt: row.updated_at, media, watchedAt: row.watched_at ?? undefined, retryCount: 0 });
    }
    for (const row of seriesResult.data) {
      const media = mediaByIdentity.get(mediaId({ provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id }));
      if (media) append({ id: -1, entityType: 'series', entityKey: media.id, provider: media.provider, mediaType: media.mediaType, providerId: media.providerId, deleted: row.is_deleted, updatedAt: row.updated_at, media, watchedAt: row.tracking_started_at, retryCount: 0 });
    }
    for (const row of episodeResult.data) {
      const media = mediaByIdentity.get(mediaId({ provider: row.series_provider as CatalogMedia['provider'], mediaType: row.series_media_type as CatalogMedia['mediaType'], providerId: row.series_provider_id }));
      if (!media) continue;
      const episode: MediaEpisode = { provider: 'tmdb', mediaType: 'series', providerId: row.episode_provider_id, seriesId: row.series_provider_id, seasonNumber: row.season_number, episodeNumber: row.episode_number, title: row.title, overview: row.overview ?? undefined, airDate: row.air_date ?? undefined, stillUrl: row.still_url ?? undefined, runtimeMinutes: row.runtime_minutes ?? undefined };
      append({ id: -1, entityType: 'episode', entityKey: `${media.id}:${row.season_number}:${row.episode_number}`, provider: 'tmdb', mediaType: 'series', providerId: row.episode_provider_id, seasonNumber: row.season_number, episodeNumber: row.episode_number, deleted: row.is_deleted, updatedAt: row.updated_at, media, watchedAt: row.watched_at ?? undefined, episode, retryCount: 0 });
    }
    for (const row of favoriteResult.data) {
      const media = mediaByIdentity.get(mediaId({ provider: row.provider as CatalogMedia['provider'], mediaType: row.media_type as CatalogMedia['mediaType'], providerId: row.provider_id }));
      if (media) append({ id: -1, entityType: 'favorite', entityKey: media.id, provider: media.provider, mediaType: media.mediaType, providerId: media.providerId, deleted: row.is_deleted, updatedAt: row.updated_at, media, watchedAt: row.favorited_at, retryCount: 0 });
    }
    return changes;
  }

  async upsert(userId: string, changes: PendingWatchStateChange[]): Promise<void> {
    if (!changes.length) return;
    const supabaseClient = client();
    const mediaByIdentity = new Map(changes.map(({ media }) => [media.id, media]));
    const mediaRows = [...mediaByIdentity.values()].map((media) => ({
      user_id: userId, provider: media.provider, media_type: media.mediaType, provider_id: media.providerId,
      title: media.title, original_title: media.originalTitle ?? null, overview: media.overview ?? null,
      poster_url: media.posterUrl ?? null, backdrop_url: media.backdropUrl ?? null, release_date: media.releaseDate ?? null,
      year: media.year ?? null, genres: JSON.parse(JSON.stringify(media.genres)) as Json,
      number_of_seasons: media.numberOfSeasons ?? null, number_of_episodes: media.numberOfEpisodes ?? null,
      season_summaries: JSON.parse(JSON.stringify(media.seasonSummaries ?? [])) as Json,
      episode_metadata: media.episodeMetadata, updated_at: new Date().toISOString(),
    }));
    const { error: mediaError } = await supabaseClient.from('library_media').upsert(mediaRows, { onConflict: 'user_id,provider,media_type,provider_id' });
    if (mediaError) throw new AppError('network', 'Could not sync your saved titles. Your local changes are safe.');

    const groups = {
      watchlist: changes.filter(({ entityType }) => entityType === 'watchlist').map((change) => ({ user_id: userId, provider: change.provider, media_type: change.mediaType, provider_id: change.providerId, added_at: change.watchedAt ?? change.updatedAt, is_deleted: change.deleted, updated_at: change.updatedAt })),
      movie: changes.filter(({ entityType }) => entityType === 'movie').map((change) => ({ user_id: userId, provider: change.provider, media_type: change.mediaType, provider_id: change.providerId, watched_at: change.deleted ? null : change.watchedAt ?? change.updatedAt, is_deleted: change.deleted, updated_at: change.updatedAt })),
      series: changes.filter(({ entityType }) => entityType === 'series').map((change) => ({ user_id: userId, provider: change.provider, media_type: change.mediaType, provider_id: change.providerId, tracking_started_at: change.watchedAt ?? change.updatedAt, is_deleted: change.deleted, updated_at: change.updatedAt })),
      episode: changes.filter((change) => change.entityType === 'episode' && change.episode).map((change) => ({ user_id: userId, provider: 'tmdb', episode_provider_id: change.providerId, series_provider: change.media.provider, series_media_type: change.media.mediaType, series_provider_id: change.media.providerId, season_number: change.seasonNumber ?? change.episode?.seasonNumber ?? 0, episode_number: change.episodeNumber ?? change.episode?.episodeNumber ?? 0, title: change.episode?.title ?? 'Episode', overview: change.episode?.overview ?? null, air_date: change.episode?.airDate ?? null, still_url: change.episode?.stillUrl ?? null, runtime_minutes: change.episode?.runtimeMinutes ?? null, watched_at: change.deleted ? null : change.watchedAt ?? change.updatedAt, is_deleted: change.deleted, updated_at: change.updatedAt })),
      favorite: changes.filter(({ entityType }) => entityType === 'favorite').map((change) => ({ user_id: userId, provider: change.provider, media_type: change.mediaType, provider_id: change.providerId, favorited_at: change.watchedAt ?? change.updatedAt, is_deleted: change.deleted, updated_at: change.updatedAt })),
    };
    const writes = [
      groups.watchlist.length ? supabaseClient.from('watchlist_entries').upsert(groups.watchlist, { onConflict: 'user_id,provider,media_type,provider_id' }) : Promise.resolve({ error: null }),
      groups.movie.length ? supabaseClient.from('movie_watches').upsert(groups.movie, { onConflict: 'user_id,provider,media_type,provider_id' }) : Promise.resolve({ error: null }),
      groups.series.length ? supabaseClient.from('tracked_series').upsert(groups.series, { onConflict: 'user_id,provider,media_type,provider_id' }) : Promise.resolve({ error: null }),
      groups.episode.length ? supabaseClient.from('episode_watches').upsert(groups.episode, { onConflict: 'user_id,episode_provider_id' }) : Promise.resolve({ error: null }),
      groups.favorite.length ? supabaseClient.from('favorite_entries').upsert(groups.favorite, { onConflict: 'user_id,provider,media_type,provider_id' }) : Promise.resolve({ error: null }),
    ];
    const results = await Promise.all(writes);
    if (results.some(({ error }) => error)) throw new AppError('network', 'Could not sync your latest changes. They will retry later.');
  }
}

export const cloudWatchStateRepository: CloudWatchStateRepository = new SupabaseWatchStateRepository();
