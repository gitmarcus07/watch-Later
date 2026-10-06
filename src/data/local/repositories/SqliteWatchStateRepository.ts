import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/domain/errors/AppError';
import type { CatalogMedia, CatalogSeason, MediaEpisode, MediaIdentity } from '@/domain/models/media';
import type { ContinueWatchingItem, LibraryStatus, SeriesProgress, WatchStateRepository, WatchlistEntry, WatchedLibraryItem } from '@/domain/models/watchState';
import { getDatabase } from '@/data/local/database/database';
import { mediaId } from '@/features/catalog/mediaIdentity';

interface MediaRow {
  id: string; provider: CatalogMedia['provider']; provider_id: string; media_type: CatalogMedia['mediaType']; title: string;
  original_title: string | null; overview: string | null; poster_url: string | null; backdrop_url: string | null;
  release_date: string | null; year: number | null; genres: string; rating: number | null; vote_count?: number | null;
  runtime_minutes: number | null; status: string | null; language: string | null; origin_countries: string;
  number_of_seasons: number | null; number_of_episodes: number | null; season_summaries: string; anime_format: string | null;
  anime_season: string | null; popularity: number | null; studios: string; episode_metadata: CatalogMedia['episodeMetadata'];
}

interface EpisodeRow {
  id: string; provider_id: string; series_id: string; season_number: number; episode_number: number; title: string;
  overview: string | null; air_date: string | null; still_url: string | null; runtime_minutes: number | null;
  watched_at: string | null; created_at?: string;
}

interface SeriesRow extends MediaRow {
  watched_count: number; cached_count: number; watched_at?: string | null; added_at?: string | null;
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function mapMedia(row: MediaRow): CatalogMedia {
  return {
    id: row.id, provider: row.provider, providerId: row.provider_id, mediaType: row.media_type,
    title: row.title, originalTitle: row.original_title ?? undefined, overview: row.overview ?? undefined,
    posterUrl: row.poster_url ?? undefined, backdropUrl: row.backdrop_url ?? undefined,
    releaseDate: row.release_date ?? undefined, year: row.year ?? undefined,
    genres: parseJson(row.genres, []), rating: row.rating ?? undefined, voteCount: row.vote_count ?? undefined,
    runtimeMinutes: row.runtime_minutes ?? undefined, status: row.status ?? undefined, language: row.language ?? undefined,
    originCountries: parseJson(row.origin_countries, []), numberOfSeasons: row.number_of_seasons ?? undefined,
    numberOfEpisodes: row.number_of_episodes ?? undefined, seasonSummaries: parseJson(row.season_summaries, []),
    animeFormat: row.anime_format ?? undefined, animeSeason: row.anime_season ?? undefined,
    popularity: row.popularity ?? undefined, studios: parseJson(row.studios, []), episodeMetadata: row.episode_metadata,
  };
}

function mapEpisode(row: EpisodeRow): MediaEpisode {
  return {
    provider: 'tmdb', mediaType: 'series', providerId: row.provider_id, seriesId: row.series_id.replace(/^tmdb:series:/, ''),
    seasonNumber: row.season_number, episodeNumber: row.episode_number, title: row.title,
    overview: row.overview ?? undefined, airDate: row.air_date ?? undefined, stillUrl: row.still_url ?? undefined,
    runtimeMinutes: row.runtime_minutes ?? undefined,
  };
}

function optional(value: string | number | undefined): string | number | null { return value ?? null; }

async function saveMedia(db: SQLiteDatabase, media: CatalogMedia): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracked_media (id, provider, provider_id, media_type, title, original_title, overview, poster_url, backdrop_url, release_date, year,
      genres, rating, vote_count, runtime_minutes, status, language, origin_countries, number_of_seasons, number_of_episodes, season_summaries, anime_format, anime_season, popularity, studios, episode_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, provider_id=excluded.provider_id, media_type=excluded.media_type, title=excluded.title,
      original_title=excluded.original_title, overview=excluded.overview, poster_url=excluded.poster_url, backdrop_url=excluded.backdrop_url,
      release_date=excluded.release_date, year=excluded.year, genres=excluded.genres, rating=excluded.rating, vote_count=excluded.vote_count, runtime_minutes=excluded.runtime_minutes,
      status=excluded.status, language=excluded.language, origin_countries=excluded.origin_countries, number_of_seasons=excluded.number_of_seasons,
      number_of_episodes=excluded.number_of_episodes, season_summaries=excluded.season_summaries, anime_format=excluded.anime_format,
      anime_season=excluded.anime_season, popularity=excluded.popularity, studios=excluded.studios, episode_metadata=excluded.episode_metadata, updated_at=CURRENT_TIMESTAMP`,
    media.id, media.provider, media.providerId, media.mediaType, media.title, optional(media.originalTitle), optional(media.overview),
    optional(media.posterUrl), optional(media.backdropUrl), optional(media.releaseDate), optional(media.year), JSON.stringify(media.genres),
    optional(media.rating), optional(media.voteCount), optional(media.runtimeMinutes), optional(media.status), optional(media.language), JSON.stringify(media.originCountries ?? []),
    optional(media.numberOfSeasons), optional(media.numberOfEpisodes), JSON.stringify(media.seasonSummaries ?? []), optional(media.animeFormat),
    optional(media.animeSeason), optional(media.popularity), JSON.stringify(media.studios ?? []), media.episodeMetadata,
  );
}

function ensureTrackableSeries(media: CatalogMedia): void {
  if (media.mediaType === 'movie') throw new AppError('validation', 'Episode tracking is only available for series.');
  if (media.provider === 'anilist' && media.episodeMetadata === 'unavailable') throw new AppError('catalog', "Episode information isn't available for this title.");
  if (media.provider !== 'tmdb' || media.mediaType !== 'series') throw new AppError('catalog', "Episode information isn't available for this title.");
}

async function ensureSeries(db: SQLiteDatabase, media: CatalogMedia): Promise<void> {
  await saveMedia(db, media);
  await db.runAsync('INSERT INTO tracked_series (media_id) VALUES (?) ON CONFLICT(media_id) DO NOTHING', media.id);
}

async function saveEpisode(db: SQLiteDatabase, series: CatalogMedia, episode: MediaEpisode): Promise<void> {
  const episodeId = `tmdb:episode:${encodeURIComponent(episode.providerId)}`;
  await db.runAsync(
    `INSERT INTO tracked_episodes (id, provider, provider_id, series_id, season_number, episode_number, title, overview, air_date, still_url, runtime_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET series_id=excluded.series_id, season_number=excluded.season_number, episode_number=excluded.episode_number,
      title=excluded.title, overview=excluded.overview, air_date=excluded.air_date, still_url=excluded.still_url, runtime_minutes=excluded.runtime_minutes, updated_at=CURRENT_TIMESTAMP`,
    episodeId, episode.provider, episode.providerId, series.id, episode.seasonNumber, episode.episodeNumber, episode.title,
    optional(episode.overview), optional(episode.airDate), optional(episode.stillUrl), optional(episode.runtimeMinutes),
  );
}

async function saveSeason(db: SQLiteDatabase, media: CatalogMedia, season: { seasonNumber: number; name: string; episodeCount?: number; overview?: string; airDate?: string; posterUrl?: string; episodes: MediaEpisode[] }): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracked_seasons (media_id, season_number, name, episode_count, overview, air_date, poster_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(media_id, season_number) DO UPDATE SET name=excluded.name, episode_count=excluded.episode_count, overview=excluded.overview,
      air_date=excluded.air_date, poster_url=excluded.poster_url, updated_at=CURRENT_TIMESTAMP`,
    media.id, season.seasonNumber, season.name, optional(season.episodeCount), optional(season.overview), optional(season.airDate), optional(season.posterUrl),
  );
  for (const episode of season.episodes) await saveEpisode(db, media, episode);
}

function toProgress(row: SeriesRow, episodes: EpisodeRow[]): SeriesProgress {
  const media = mapMedia(row);
  const ordered = episodes.filter((episode) => !episode.watched_at).sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number);
  const watchedEpisodeCount = row.watched_count;
  const cachedEpisodeCount = row.cached_count;
  const summaryCounts = media.seasonSummaries?.map((season) => season.episodeCount);
  const totalEpisodeCount = media.numberOfEpisodes && media.numberOfEpisodes > 0 ? media.numberOfEpisodes
    : summaryCounts?.length && summaryCounts.every((count): count is number => typeof count === 'number') ? summaryCounts.reduce((sum, count) => sum + count, 0) : undefined;
  const denominator = totalEpisodeCount ?? cachedEpisodeCount;
  const nextEpisode = ordered[0] ? mapEpisode(ordered[0]) : undefined;
  const cachedSeasons = new Set(episodes.map((episode) => episode.season_number));
  const nextSeasonNumber = !nextEpisode && totalEpisodeCount !== undefined && watchedEpisodeCount < totalEpisodeCount
    ? media.seasonSummaries?.find((season) => !cachedSeasons.has(season.seasonNumber))?.seasonNumber
    : undefined;
  return {
    identity: { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId }, media,
    watchedEpisodeCount, cachedEpisodeCount, totalEpisodeCount,
    progress: denominator > 0 ? Math.min(1, watchedEpisodeCount / denominator) : 0,
    isComplete: Boolean(totalEpisodeCount && watchedEpisodeCount >= totalEpisodeCount), lastWatchedAt: row.watched_at ?? undefined, nextEpisode, nextSeasonNumber,
  };
}

export class SqliteWatchStateRepository implements WatchStateRepository {
  constructor(private readonly openDatabase: () => Promise<SQLiteDatabase> = getDatabase) {}

  private async run<T>(fallbackMessage: string, action: (database: SQLiteDatabase) => Promise<T>): Promise<T> {
    try { return await action(await this.openDatabase()); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('database', fallbackMessage, { cause: error });
    }
  }

  async getTrackedMedia(identity: MediaIdentity): Promise<CatalogMedia | undefined> {
    return this.run("Couldn't load this saved title.", async (db) => {
      const row = await db.getFirstAsync<MediaRow>('SELECT * FROM tracked_media WHERE provider = ? AND media_type = ? AND provider_id = ?', identity.provider, identity.mediaType, identity.providerId);
      return row ? mapMedia(row) : undefined;
    });
  }

  async getLibraryStatuses(identities: MediaIdentity[]): Promise<Record<string, LibraryStatus>> {
    const statuses: Record<string, LibraryStatus> = Object.fromEntries(identities.map((identity) => [mediaId(identity), { watchlisted: false, movieWatched: false, tracking: false }]));
    if (!identities.length) return statuses;
    return this.run("Couldn't load saved states.", async (db) => {
      const ids = identities.map(mediaId);
      const placeholders = ids.map(() => '?').join(', ');
      const rows = await db.getAllAsync<{ id: string; watchlisted: number; movie_watched: number; tracking: number }>(
        `SELECT m.id,
          EXISTS (SELECT 1 FROM watchlist_entries w WHERE w.media_id = m.id) AS watchlisted,
          EXISTS (SELECT 1 FROM movie_watches mw WHERE mw.media_id = m.id) AS movie_watched,
          EXISTS (SELECT 1 FROM tracked_series ts WHERE ts.media_id = m.id) AS tracking
         FROM tracked_media m WHERE m.id IN (${placeholders})`, ...ids,
      );
      for (const row of rows) statuses[row.id] = { watchlisted: row.watchlisted === 1, movieWatched: row.movie_watched === 1, tracking: row.tracking === 1 };
      return statuses;
    });
  }

  async getCachedSeason(identity: MediaIdentity, seasonNumber: number): Promise<CatalogSeason | undefined> {
    return this.run("Couldn't load saved episode information.", async (db) => {
      const seriesId = mediaId(identity);
      const season = await db.getFirstAsync<{ name: string; overview: string | null; air_date: string | null; poster_url: string | null }>(
        'SELECT name, overview, air_date, poster_url FROM tracked_seasons WHERE media_id = ? AND season_number = ?', seriesId, seasonNumber,
      );
      if (!season) return undefined;
      const rows = await db.getAllAsync<EpisodeRow>('SELECT * FROM tracked_episodes WHERE series_id = ? AND season_number = ? ORDER BY episode_number', seriesId, seasonNumber);
      return { series: identity, seasonNumber, name: season.name, overview: season.overview ?? undefined, airDate: season.air_date ?? undefined, posterUrl: season.poster_url ?? undefined, episodes: rows.map(mapEpisode) };
    });
  }

  async addToWatchlist(media: CatalogMedia): Promise<void> {
    await this.run("Couldn't update your watchlist. Try again.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await saveMedia(tx, media);
        await tx.runAsync('INSERT INTO watchlist_entries (media_id) VALUES (?) ON CONFLICT(media_id) DO NOTHING', media.id);
      });
    });
  }

  async removeFromWatchlist(identity: MediaIdentity): Promise<void> {
    await this.run("Couldn't update your watchlist. Try again.", async (db) => {
      const id = mediaId(identity);
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('DELETE FROM watchlist_entries WHERE media_id = ?', id);
        await this.pruneMedia(tx, id);
      });
    });
  }

  async getWatchlist(): Promise<WatchlistEntry[]> {
    return this.run("Couldn't load your watchlist.", async (db) => {
      const rows = await db.getAllAsync<MediaRow & { added_at: string }>('SELECT m.*, w.added_at FROM watchlist_entries w JOIN tracked_media m ON m.id = w.media_id ORDER BY w.added_at DESC, m.title COLLATE NOCASE');
      return rows.map((row) => ({ media: mapMedia(row), addedAt: row.added_at }));
    });
  }

  async isInWatchlist(identity: MediaIdentity): Promise<boolean> {
    return this.run("Couldn't check your watchlist.", async (db) => Boolean(await db.getFirstAsync('SELECT 1 AS found FROM watchlist_entries WHERE media_id = ?', mediaId(identity))));
  }

  async markMovieWatched(media: CatalogMedia, watched: boolean): Promise<void> {
    if (media.mediaType !== 'movie') throw new AppError('validation', 'Only movies can be marked watched here.');
    await this.run("Couldn't update watched status. Try again.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await saveMedia(tx, media);
        if (watched) await tx.runAsync('INSERT INTO movie_watches (media_id) VALUES (?) ON CONFLICT(media_id) DO NOTHING', media.id);
        else await tx.runAsync('DELETE FROM movie_watches WHERE media_id = ?', media.id);
        if (!watched) await this.pruneMedia(tx, media.id);
      });
    });
  }

  async isMovieWatched(identity: MediaIdentity): Promise<boolean> {
    return this.run("Couldn't load watched status.", async (db) => Boolean(await db.getFirstAsync('SELECT 1 AS found FROM movie_watches WHERE media_id = ?', mediaId(identity))));
  }

  async startTrackingSeries(media: CatalogMedia): Promise<void> {
    if (media.mediaType === 'movie') throw new AppError('validation', 'Only series can be tracked.');
    await this.run("Couldn't start tracking this series.", async (db) => { await db.withExclusiveTransactionAsync((tx) => ensureSeries(tx, media)); });
  }

  async stopTrackingSeries(identity: MediaIdentity): Promise<void> {
    await this.run("Couldn't stop tracking this series.", async (db) => {
      const id = mediaId(identity);
      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync('DELETE FROM tracked_series WHERE media_id = ?', id);
        await this.pruneMedia(tx, id);
      });
    });
  }

  async isSeriesTracked(identity: MediaIdentity): Promise<boolean> {
    return this.run("Couldn't load series tracking status.", async (db) => Boolean(await db.getFirstAsync('SELECT 1 AS found FROM tracked_series WHERE media_id = ?', mediaId(identity))));
  }

  async storeSeason(media: CatalogMedia, seasonNumber: number, name: string, episodeCount: number | undefined, overview: string | undefined, airDate: string | undefined, posterUrl: string | undefined, episodes: MediaEpisode[]): Promise<void> {
    ensureTrackableSeries(media);
    await this.run("Couldn't save this season's episode information.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await saveMedia(tx, media);
        await saveSeason(tx, media, { seasonNumber, name, episodeCount, overview, airDate, posterUrl, episodes });
      });
    });
  }

  async setEpisodeWatched(media: CatalogMedia, season: CatalogSeason, episode: MediaEpisode, watched: boolean): Promise<void> {
    ensureTrackableSeries(media);
    await this.run("Couldn't update this episode. Try again.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await ensureSeries(tx, media);
        const summary = media.seasonSummaries?.find((item) => item.seasonNumber === season.seasonNumber);
        await saveSeason(tx, media, { ...season, episodeCount: summary?.episodeCount });
        const now = watched ? new Date().toISOString() : null;
        await tx.runAsync('UPDATE tracked_episodes SET watched_at = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(watched_at, ?) END, updated_at = CURRENT_TIMESTAMP WHERE id = ?', now, now, `tmdb:episode:${encodeURIComponent(episode.providerId)}`);
        await tx.runAsync('UPDATE tracked_series SET updated_at = CURRENT_TIMESTAMP WHERE media_id = ?', media.id);
      });
    });
  }

  async setSeasonWatched(media: CatalogMedia, season: CatalogSeason, watched: boolean): Promise<void> {
    ensureTrackableSeries(media);
    if (!season.episodes.length) throw new AppError('catalog', "Episode information isn't available for this season.");
    await this.run("Couldn't update this season. Try again.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        await ensureSeries(tx, media);
        const summary = media.seasonSummaries?.find((item) => item.seasonNumber === season.seasonNumber);
        await saveSeason(tx, media, { ...season, episodeCount: summary?.episodeCount });
        const now = watched ? new Date().toISOString() : null;
        await tx.runAsync('UPDATE tracked_episodes SET watched_at = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(watched_at, ?) END, updated_at = CURRENT_TIMESTAMP WHERE series_id = ? AND season_number = ?', now, now, media.id, season.seasonNumber);
        await tx.runAsync('UPDATE tracked_series SET updated_at = CURRENT_TIMESTAMP WHERE media_id = ?', media.id);
      });
    });
  }

  async setSeriesWatched(media: CatalogMedia, seasons: { seasonNumber: number; name: string; episodeCount?: number; overview?: string; airDate?: string; posterUrl?: string; episodes: MediaEpisode[] }[], watched: boolean): Promise<void> {
    ensureTrackableSeries(media);
    if (watched && (!seasons.length || seasons.every((season) => !season.episodes.length))) throw new AppError('catalog', "Episode information isn't available for this series.");
    await this.run("Couldn't update this series. Try again.", async (db) => {
      await db.withExclusiveTransactionAsync(async (tx) => {
        if (watched || seasons.length) await ensureSeries(tx, media);
        for (const season of seasons) await saveSeason(tx, media, season);
        const now = watched ? new Date().toISOString() : null;
        await tx.runAsync('UPDATE tracked_episodes SET watched_at = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(watched_at, ?) END, updated_at = CURRENT_TIMESTAMP WHERE series_id = ?', now, now, media.id);
        await tx.runAsync('UPDATE tracked_series SET updated_at = CURRENT_TIMESTAMP WHERE media_id = ?', media.id);
      });
    });
  }

  async getEpisodeWatched(identity: MediaIdentity): Promise<boolean> {
    return this.run("Couldn't load episode status.", async (db) => Boolean(await db.getFirstAsync('SELECT 1 AS found FROM tracked_episodes WHERE provider = ? AND provider_id = ? AND watched_at IS NOT NULL', identity.provider, identity.providerId)));
  }

  async getWatchedEpisodeIds(seriesIdentity: MediaIdentity, seasonNumber: number): Promise<string[]> {
    return this.run("Couldn't load episode status.", async (db) => {
      const rows = await db.getAllAsync<{ provider_id: string }>('SELECT provider_id FROM tracked_episodes WHERE series_id = ? AND season_number = ? AND watched_at IS NOT NULL', mediaId(seriesIdentity), seasonNumber);
      return rows.map((row) => row.provider_id);
    });
  }

  async getSeriesProgress(): Promise<SeriesProgress[]> {
    return this.run("Couldn't load series progress.", async (db) => {
      const series = await db.getAllAsync<SeriesRow>(
        `SELECT m.*, (SELECT MAX(e.watched_at) FROM tracked_episodes e WHERE e.series_id = m.id) AS watched_at,
          (SELECT COUNT(*) FROM tracked_episodes e WHERE e.series_id = m.id AND e.watched_at IS NOT NULL) AS watched_count,
          (SELECT COUNT(*) FROM tracked_episodes e WHERE e.series_id = m.id) AS cached_count
         FROM tracked_series t JOIN tracked_media m ON m.id = t.media_id ORDER BY t.updated_at DESC, m.title COLLATE NOCASE`,
      );
      const episodes = await db.getAllAsync<EpisodeRow>('SELECT * FROM tracked_episodes ORDER BY season_number, episode_number');
      return series.map((row) => toProgress(row, episodes.filter((episode) => episode.series_id === row.id)));
    });
  }

  async getContinueWatching(): Promise<ContinueWatchingItem[]> {
    return (await this.getSeriesProgress()).filter((item) => item.watchedEpisodeCount > 0 && !item.isComplete && Boolean(item.nextEpisode || item.nextSeasonNumber));
  }

  async getWatchedLibrary(): Promise<WatchedLibraryItem[]> {
    return this.run("Couldn't load watched titles.", async (db) => {
      const movies = await db.getAllAsync<MediaRow & { watched_at: string }>('SELECT m.*, w.watched_at FROM movie_watches w JOIN tracked_media m ON m.id = w.media_id ORDER BY w.watched_at DESC, m.title COLLATE NOCASE');
      const seriesRows = await db.getAllAsync<SeriesRow>(
        `SELECT m.*, (SELECT MAX(e.watched_at) FROM tracked_episodes e WHERE e.series_id = m.id) AS watched_at,
          (SELECT COUNT(*) FROM tracked_episodes e WHERE e.series_id = m.id AND e.watched_at IS NOT NULL) AS watched_count,
          (SELECT COUNT(*) FROM tracked_episodes e WHERE e.series_id = m.id) AS cached_count
         FROM tracked_media m
         WHERE EXISTS (SELECT 1 FROM tracked_episodes e WHERE e.series_id = m.id AND e.watched_at IS NOT NULL)
         ORDER BY m.updated_at DESC, m.title COLLATE NOCASE`,
      );
      const episodes = await db.getAllAsync<EpisodeRow>('SELECT * FROM tracked_episodes ORDER BY season_number, episode_number');
      return [
        ...movies.map((row): WatchedLibraryItem => ({ kind: 'movie', media: mapMedia(row), watchedAt: row.watched_at })),
        ...seriesRows.map((row): WatchedLibraryItem => ({ kind: 'series', progress: toProgress(row, episodes.filter((episode) => episode.series_id === row.id)) })),
      ].sort((a, b) => {
        const dateA = a.kind === 'movie' ? a.watchedAt : a.progress.lastWatchedAt ?? '';
        const dateB = b.kind === 'movie' ? b.watchedAt : b.progress.lastWatchedAt ?? '';
        return dateB.localeCompare(dateA);
      });
    });
  }

  private async pruneMedia(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(
      `DELETE FROM tracked_media WHERE id = ? AND NOT EXISTS (SELECT 1 FROM watchlist_entries WHERE media_id = ?)
       AND NOT EXISTS (SELECT 1 FROM movie_watches WHERE media_id = ?) AND NOT EXISTS (SELECT 1 FROM tracked_series WHERE media_id = ?)`, id, id, id, id,
    );
  }
}

export const watchStateRepository: WatchStateRepository = new SqliteWatchStateRepository();
