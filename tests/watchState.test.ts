import type { CatalogMedia, CatalogSeason, MediaEpisode } from '@/domain/models/media';
import type { PendingWatchStateChange } from '@/domain/models/watchState';
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

  it('migrates a fresh database to version 7 with watch state and durable sync tables', async () => {
    const version = await adapter.database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const tables = await adapter.database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const indexes = await adapter.database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'");
    expect(version?.user_version).toBe(7);
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['tracked_media', 'watchlist_entries', 'movie_watches', 'tracked_series', 'tracked_seasons', 'tracked_episodes', 'sync_queue', 'account_binding', 'favorite_entries', 'custom_lists', 'custom_list_items']));
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_watchlist_added', 'idx_movie_watches_date', 'idx_tracked_series_updated', 'idx_tracked_episodes_series_order', 'idx_tracked_episodes_watched']));
  });

  it('preserves a legacy NOT NULL media_json column and supports enqueue and account binding', async () => {
    const legacy = createSqliteTestAdapter();
    legacy.raw.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO schema_migrations(version) VALUES (1), (2), (3), (4), (5);
      PRAGMA user_version = 5;
      CREATE TABLE tracked_media (
        id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, provider_id TEXT NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL,
        original_title TEXT, overview TEXT, poster_url TEXT, backdrop_url TEXT, release_date TEXT, year INTEGER, genres TEXT NOT NULL DEFAULT '[]',
        rating REAL, vote_count INTEGER, runtime_minutes INTEGER, status TEXT, language TEXT, origin_countries TEXT NOT NULL DEFAULT '[]',
        number_of_seasons INTEGER, number_of_episodes INTEGER, season_summaries TEXT NOT NULL DEFAULT '[]', anime_format TEXT, anime_season TEXT,
        popularity INTEGER, studios TEXT NOT NULL DEFAULT '[]', episode_metadata TEXT NOT NULL DEFAULT 'unavailable',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE watchlist_entries (media_id TEXT PRIMARY KEY NOT NULL, added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE movie_watches (media_id TEXT PRIMARY KEY NOT NULL, watched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE tracked_series (media_id TEXT PRIMARY KEY NOT NULL, tracking_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE tracked_episodes (
        id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, provider_id TEXT NOT NULL, series_id TEXT NOT NULL, season_number INTEGER NOT NULL,
        episode_number INTEGER NOT NULL, title TEXT NOT NULL, overview TEXT, air_date TEXT, still_url TEXT, runtime_minutes INTEGER,
        watched_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE account_binding (id INTEGER PRIMARY KEY CHECK (id = 1), account_id TEXT NOT NULL, bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, provider TEXT NOT NULL, media_type TEXT NOT NULL,
        provider_id TEXT NOT NULL, season_number INTEGER, episode_number INTEGER, is_deleted INTEGER NOT NULL, updated_at TEXT NOT NULL,
        payload TEXT NOT NULL, media_json TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        UNIQUE (entity_type, entity_key)
      );
      INSERT INTO sync_queue (entity_type, entity_key, provider, media_type, provider_id, is_deleted, updated_at, payload, retry_count, last_error, media_json)
      VALUES ('movie', 'legacy:existing', 'tmdb', 'movie', '999', 0, '2026-01-02T03:04:05.000Z', '{}', 3, 'keep this retry', 'legacy media snapshot');
    `);

    await runMigrations(legacy.database);
    const legacyRepository = new SqliteWatchStateRepository(async () => legacy.database);
    const movie = createMovie(987);
    await legacyRepository.addToWatchlist(movie);
    await Promise.all([legacyRepository.bindAccount('user-legacy'), legacyRepository.bindAccount('user-legacy')]);

    const retained = await legacy.database.getFirstAsync<{ retry_count: number; last_error: string; media_json: string }>(
      'SELECT retry_count, last_error, media_json FROM sync_queue WHERE entity_key = ?', 'legacy:existing',
    );
    const enqueued = await legacy.database.getFirstAsync<{ payload: string; media_json: string }>(
      'SELECT payload, media_json FROM sync_queue WHERE entity_key = ?', movie.id,
    );
    expect(retained).toEqual({ retry_count: 3, last_error: 'keep this retry', media_json: 'legacy media snapshot' });
    expect(JSON.parse(enqueued?.payload ?? '{}').media.title).toBe(movie.title);
    expect(JSON.parse(enqueued?.media_json ?? '{}').title).toBe(movie.title);
    expect(await legacyRepository.getBoundAccount()).toBe('user-legacy');
    legacy.close();
  });

  it('repairs a legacy sync_queue missing payload without losing queued changes', async () => {
    const legacy = createSqliteTestAdapter();
    legacy.raw.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO schema_migrations(version) VALUES (1), (2), (3), (4);
      CREATE TABLE sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        media_type TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        season_number INTEGER,
        episode_number INTEGER,
        is_deleted INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        UNIQUE (entity_type, entity_key)
      );
      INSERT INTO sync_queue (entity_type, entity_key, provider, media_type, provider_id, is_deleted, updated_at, retry_count, last_error)
      VALUES ('movie', 'tmdb:movie:7', 'tmdb', 'movie', '7', 0, '2026-01-02T03:04:05.000Z', 2, 'retry later');
    `);

    await runMigrations(legacy.database);
    const columns = await legacy.database.getAllAsync<{ name: string }>('PRAGMA table_info(sync_queue)');
    const queued = await legacy.database.getFirstAsync<{ id: number; entity_type: string; entity_key: string; provider_id: string; updated_at: string; payload: string; retry_count: number; last_error: string }>('SELECT * FROM sync_queue WHERE entity_key = ?', 'tmdb:movie:7');
    const version = await legacy.database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

    expect(columns.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'id', 'entity_type', 'entity_key', 'provider', 'media_type', 'provider_id', 'season_number', 'episode_number',
      'is_deleted', 'updated_at', 'payload', 'retry_count', 'last_error',
    ]));
    expect(queued).toMatchObject({ id: 1, entity_type: 'movie', entity_key: 'tmdb:movie:7', provider_id: '7', updated_at: '2026-01-02T03:04:05.000Z', payload: '{}', retry_count: 2, last_error: 'retry later' });
    expect(version?.user_version).toBe(7);

    await runMigrations(legacy.database);
    expect(await legacy.database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_queue')).toEqual({ count: 1 });
    legacy.close();
  });

  it('preserves existing Phase 1 data when applying the new migration', async () => {
    const legacy = createSqliteTestAdapter();
    legacy.raw.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO schema_migrations(version) VALUES (1); CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO app_metadata(key,value) VALUES ('install','kept');");
    await runMigrations(legacy.database);
    const preserved = await legacy.database.getFirstAsync<{ value: string }>("SELECT value FROM app_metadata WHERE key = 'install'");
    const versions = await legacy.database.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
    expect(preserved?.value).toBe('kept');
    expect(versions.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
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

  it('persists pending watchlist, movie and episode sync work across repository reloads and coalesces rapid mutations', async () => {
    const movie = createMovie(314);
    await repository.addToWatchlist(movie);
    await repository.removeFromWatchlist(movie);
    await repository.markMovieWatched(movie, true);
    await repository.markMovieWatched(movie, false);
    const pending = await repository.getPendingChanges();
    expect(pending.filter((change) => change.entityType === 'watchlist')).toHaveLength(1);
    expect(pending.find((change) => change.entityType === 'watchlist')?.deleted).toBe(true);
    expect(pending.find((change) => change.entityType === 'movie')?.deleted).toBe(true);
    await repository.bindAccount('user-a');
    expect(await repository.getBoundAccount()).toBe('user-a');
    await expect(repository.bindAccount('user-b')).rejects.toThrow('linked to another account');
    const reloaded = new SqliteWatchStateRepository(async () => adapter.database);
    expect(await reloaded.getPendingChanges()).toHaveLength(pending.length);
  });

  it('applies remote episode state without creating a sync loop or resurrecting stopped series tracking', async () => {
    const series = createSeries();
    const episode = createEpisode(series, 3);
    const remote: PendingWatchStateChange = { id: -1, entityType: 'episode', entityKey: `${series.id}:1:3`, provider: 'tmdb', mediaType: 'series', providerId: episode.providerId, seasonNumber: 1, episodeNumber: 3, deleted: false, updatedAt: '2026-10-06T10:00:00.000Z', watchedAt: '2026-10-06T09:00:00.000Z', media: series, episode, retryCount: 0 };
    await repository.applyRemoteChanges([remote]);
    expect(await repository.getEpisodeWatched(episode)).toBe(true);
    expect(await repository.isSeriesTracked(series)).toBe(false);
    expect(await repository.getPendingChanges()).toEqual([]);
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
