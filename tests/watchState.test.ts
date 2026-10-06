import type { CatalogMedia, CatalogSeason, MediaEpisode } from '@/domain/models/media';
import { mapAniListAnime } from '@/data/remote/anilist/mappers';
import { mapTmdbMovie, mapTmdbTv } from '@/data/remote/tmdb/mappers';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteWatchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { createSqliteTestAdapter } from './sqliteTestAdapter';

function createMovie(id: number): CatalogMedia {
  return mapTmdbMovie({ id, title: `Film ${id}`, original_title: `Film ${id}`, overview: 'A local story', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', release_date: '2024-01-01', genres: [{ id: 1, name: 'Drama' }], vote_average: 8, vote_count: 20, runtime: 100, status: 'Released', original_language: 'en', production_countries: [{ iso_3166_1: 'US', name: 'United States' }] });
}

function createSeries(): CatalogMedia {
  return mapTmdbTv({ id: 42, name: 'Series 42', original_name: 'Series 42', overview: 'Series overview', poster_path: '/series.jpg', backdrop_path: '/backdrop.jpg', first_air_date: '2020-01-01', genres: [{ id: 2, name: 'Drama' }], vote_average: 9, vote_count: 100, episode_run_time: [45], status: 'Returning Series', original_language: 'en', origin_country: ['US'], number_of_seasons: 2, number_of_episodes: 4, seasons: [{ season_number: 1, name: 'Season 1', episode_count: 3, air_date: '2020-01-01', poster_path: '/s1.jpg' }, { season_number: 2, name: 'Season 2', episode_count: 1, air_date: '2021-01-01' }] });
}

function createEpisode(series: CatalogMedia, episodeNumber: number, seasonNumber = 1): MediaEpisode {
  return { provider: 'tmdb', mediaType: 'series', providerId: `${seasonNumber}00${episodeNumber}`, seriesId: series.providerId, seasonNumber, episodeNumber, title: `Episode ${episodeNumber}`, overview: 'Episode overview', airDate: '2020-01-01', stillUrl: 'https://image.example/still.jpg', runtimeMinutes: 45 };
}

function createSeason(series: CatalogMedia, episodes: MediaEpisode[]): CatalogSeason {
  return { series, seasonNumber: 1, name: 'Season 1', overview: 'Season overview', airDate: '2020-01-01', posterUrl: 'https://image.example/season.jpg', episodes };
}

describe('Phase 4 SQLite watch state', () => {
  let adapter: ReturnType<typeof createSqliteTestAdapter>;
  let repository: SqliteWatchStateRepository;

  beforeEach(async () => {
    adapter = createSqliteTestAdapter();
    adapter.raw.exec('PRAGMA foreign_keys = ON');
    await runMigrations(adapter.database);
    repository = new SqliteWatchStateRepository(async () => adapter.database);
  });

  afterEach(() => adapter.close());

  it('migrates a fresh database to version 3 with relational tables and indexes', async () => {
    const version = await adapter.database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const tables = await adapter.database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const indexes = await adapter.database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'");
    expect(version?.user_version).toBe(3);
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['tracked_media', 'watchlist_entries', 'movie_watches', 'tracked_series', 'tracked_seasons', 'tracked_episodes']));
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_watchlist_added', 'idx_movie_watches_date', 'idx_tracked_series_updated', 'idx_tracked_episodes_series_order', 'idx_tracked_episodes_watched']));
  });

  it('preserves existing Phase 1 data when applying the new migration', async () => {
    const legacy = createSqliteTestAdapter();
    legacy.raw.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO schema_migrations(version) VALUES (1); CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO app_metadata(key,value) VALUES ('install','kept');");
    await runMigrations(legacy.database);
    const preserved = await legacy.database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'install'");
    const versions = await legacy.database.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(preserved?.value).toBe('kept');
    expect(versions.map(({ version }) => version)).toEqual([1, 2, 3]);
    legacy.close();
  });

  it('upgrades an older partial v2 media table without losing saved metadata', async () => {
    const legacy = createSqliteTestAdapter();
    legacy.raw.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO schema_migrations(version) VALUES (1), (2); CREATE TABLE tracked_media (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL DEFAULT 'tmdb', provider_id TEXT NOT NULL, media_type TEXT NOT NULL DEFAULT 'movie', title TEXT NOT NULL); INSERT INTO tracked_media(id, provider_id, title) VALUES ('tmdb:movie:7', '7', 'Saved title');");
    await runMigrations(legacy.database);
    const repositoryAfterUpgrade = new SqliteWatchStateRepository(async () => legacy.database);
    const saved = await repositoryAfterUpgrade.getTrackedMedia({ provider: 'tmdb', mediaType: 'movie', providerId: '7' });
    expect(saved?.title).toBe('Saved title');
    expect(saved?.genres).toEqual([]);
    expect(await legacy.database.getFirstAsync('SELECT 1 AS found FROM sqlite_master WHERE type = ? AND name = ?', 'index', 'idx_tracked_media_provider_identity')).toBeTruthy();
    legacy.close();
  });

  it('keeps movie watchlist and watched state independent, unique, and persistent across repository reload', async () => {
    const movie = createMovie(42);
    await repository.addToWatchlist(movie);
    await repository.addToWatchlist(movie);
    await repository.markMovieWatched(movie, true);
    const firstWatch = await adapter.database.getFirstAsync<{ watched_at: string }>('SELECT watched_at FROM movie_watches WHERE media_id = ?', movie.id);
    await repository.markMovieWatched(movie, true);
    const repeatedWatch = await adapter.database.getFirstAsync<{ watched_at: string }>('SELECT watched_at FROM movie_watches WHERE media_id = ?', movie.id);
    const reloaded = new SqliteWatchStateRepository(async () => adapter.database);
    expect((await reloaded.getWatchlist()).map(({ media }) => media.id)).toEqual([movie.id]);
    expect(await reloaded.isMovieWatched(movie)).toBe(true);
    expect(repeatedWatch?.watched_at).toBe(firstWatch?.watched_at);
    await reloaded.removeFromWatchlist(movie);
    expect(await reloaded.isMovieWatched(movie)).toBe(true);
    expect(await reloaded.getWatchlist()).toHaveLength(0);
    await reloaded.markMovieWatched(movie, false);
    expect(await reloaded.getWatchedLibrary()).toHaveLength(0);
  });

  it('keeps provider-qualified identities separate for identical numeric IDs', async () => {
    const movie = createMovie(42);
    const anime = mapAniListAnime({ id: 42, title: { english: 'Anime 42', romaji: 'Anime 42', native: 'アニメ' }, description: 'Anime', coverImage: { large: 'https://image.example/anime.jpg' }, episodes: 12, genres: [] });
    await repository.addToWatchlist(movie);
    await repository.addToWatchlist(anime);
    expect((await repository.getWatchlist()).map(({ media }) => media.id).sort()).toEqual([movie.id, anime.id].sort());
    const status = await repository.getLibraryStatuses([movie, anime]);
    expect(status[movie.id].watchlisted).toBe(true);
    expect(status[anime.id].watchlisted).toBe(true);
  });

  it('finds a non-contiguous episode gap, calculates progress, and persists season operations', async () => {
    const series = createSeries();
    const episodes = [1, 2, 3].map((number) => createEpisode(series, number));
    const season = createSeason(series, episodes);
    await repository.startTrackingSeries(series);
    await repository.setEpisodeWatched(series, season, episodes[0], true);
    await repository.setEpisodeWatched(series, season, episodes[2], true);
    const reloaded = new SqliteWatchStateRepository(async () => adapter.database);
    let progress = (await reloaded.getSeriesProgress())[0];
    expect(progress.watchedEpisodeCount).toBe(2);
    expect(progress.cachedEpisodeCount).toBe(3);
    expect(progress.progress).toBeCloseTo(0.5);
    expect(progress.nextEpisode?.episodeNumber).toBe(2);
    expect((await reloaded.getContinueWatching())[0]?.nextEpisode?.episodeNumber).toBe(2);
    await reloaded.setSeasonWatched(series, season, true);
    progress = (await reloaded.getSeriesProgress())[0];
    expect(progress.isComplete).toBe(false);
    expect(progress.nextSeasonNumber).toBe(2);
    expect((await reloaded.getContinueWatching())[0]?.nextSeasonNumber).toBe(2);
    await reloaded.setSeasonWatched(series, season, false);
    expect(await reloaded.getWatchedEpisodeIds(series, 1)).toEqual([]);
    expect((await reloaded.getSeriesProgress())[0]?.nextEpisode?.episodeNumber).toBe(1);
  });

  it('marks real series episodes watched atomically and clears them without inventing metadata', async () => {
    const series = createSeries();
    const first = createSeason(series, [1, 2, 3].map((number) => createEpisode(series, number)));
    const secondEpisode = createEpisode(series, 1, 2);
    const second: CatalogSeason = { series, seasonNumber: 2, name: 'Season 2', episodes: [secondEpisode] };
    await repository.setSeriesWatched(series, [first, second], true);
    const watched = await repository.getWatchedLibrary();
    expect(watched).toHaveLength(1);
    expect(watched[0]?.kind).toBe('series');
    if (watched[0]?.kind === 'series') {
      expect(watched[0].progress.watchedEpisodeCount).toBe(4);
      expect(watched[0].progress.isComplete).toBe(true);
    }
    await repository.setSeriesWatched(series, [], false);
    expect(await repository.getWatchedEpisodeIds(series, 1)).toEqual([]);
    expect(await repository.getWatchedEpisodeIds(series, 2)).toEqual([]);
    await expect(repository.setSeriesWatched(series, [{ ...first, episodes: [] }], true)).rejects.toThrow('Episode information');
    expect(await adapter.database.getFirstAsync('SELECT 1 AS found FROM tracked_episodes WHERE series_id = ? AND watched_at IS NOT NULL', series.id)).toBeNull();
  });

  it('rolls back season mutations atomically if episode metadata conflicts', async () => {
    const series = createSeries();
    const duplicatePosition = createSeason(series, [createEpisode(series, 1), { ...createEpisode(series, 1), providerId: 'other-real-id' }]);
    await expect(repository.setSeasonWatched(series, duplicatePosition, true)).rejects.toMatchObject({ kind: 'database' });
    expect(await repository.isSeriesTracked(series)).toBe(false);
    expect(await repository.getCachedSeason(series, 1)).toBeUndefined();
  });

  it('supports anime watchlist/high-level tracking without creating fake episodes', async () => {
    const anime = mapAniListAnime({ id: 42, title: { english: 'Anime 42', romaji: 'Anime 42', native: 'アニメ' }, description: 'Anime', episodes: 12, genres: [] });
    await repository.addToWatchlist(anime);
    await repository.startTrackingSeries(anime);
    expect(await repository.isSeriesTracked(anime)).toBe(true);
    expect(await repository.getSeriesProgress()).toEqual(expect.arrayContaining([expect.objectContaining({ media: expect.objectContaining({ id: anime.id }), cachedEpisodeCount: 0, watchedEpisodeCount: 0 })]));
    expect(await repository.getWatchedEpisodeIds(anime, 1)).toEqual([]);
    await expect(repository.setSeriesWatched(anime, [], true)).rejects.toMatchObject({ kind: 'catalog' });
  });
});
