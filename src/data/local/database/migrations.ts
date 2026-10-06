import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/domain/errors/AppError';

export const DATABASE_VERSION = 4;

const migrations: Record<number, readonly string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS content_references (
      id TEXT PRIMARY KEY NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tmdb_id, media_type)
    );`,
    `CREATE TABLE IF NOT EXISTS user_content_state (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      content_id TEXT NOT NULL REFERENCES content_references(id) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK (state IN ('watchlist', 'watched', 'in_progress')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );`,
    `CREATE TABLE IF NOT EXISTS sync_metadata (
      entity_type TEXT PRIMARY KEY NOT NULL,
      cursor TEXT,
      last_synced_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ],
  2: [
    `CREATE TABLE IF NOT EXISTS tracked_media (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('tmdb', 'anilist')),
      provider_id TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'series', 'anime')),
      title TEXT NOT NULL,
      original_title TEXT,
      overview TEXT,
      poster_url TEXT,
      backdrop_url TEXT,
      release_date TEXT,
      year INTEGER,
      rating REAL,
      vote_count INTEGER,
      runtime_minutes INTEGER,
      status TEXT,
      language TEXT,
      origin_countries TEXT NOT NULL DEFAULT '[]',
      genres TEXT NOT NULL DEFAULT '[]',
      number_of_seasons INTEGER,
      number_of_episodes INTEGER,
      season_summaries TEXT NOT NULL DEFAULT '[]',
      anime_format TEXT,
      anime_season TEXT,
      popularity INTEGER,
      studios TEXT NOT NULL DEFAULT '[]',
      episode_metadata TEXT NOT NULL DEFAULT 'unavailable' CHECK (episode_metadata IN ('available', 'unavailable')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, media_type, provider_id)
    );`,
    `CREATE TABLE IF NOT EXISTS watchlist_entries (
      media_id TEXT PRIMARY KEY NOT NULL REFERENCES tracked_media(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS movie_watches (
      media_id TEXT PRIMARY KEY NOT NULL REFERENCES tracked_media(id) ON DELETE CASCADE,
      watched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS tracked_series (
      media_id TEXT PRIMARY KEY NOT NULL REFERENCES tracked_media(id) ON DELETE CASCADE,
      tracking_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS tracked_seasons (
      media_id TEXT NOT NULL REFERENCES tracked_media(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL CHECK (season_number >= 0),
      name TEXT NOT NULL,
      episode_count INTEGER,
      overview TEXT,
      air_date TEXT,
      poster_url TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (media_id, season_number)
    );`,
    `CREATE TABLE IF NOT EXISTS tracked_episodes (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL CHECK (provider = 'tmdb'),
      provider_id TEXT NOT NULL,
      series_id TEXT NOT NULL REFERENCES tracked_media(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL CHECK (season_number >= 0),
      episode_number INTEGER NOT NULL CHECK (episode_number >= 0),
      title TEXT NOT NULL,
      overview TEXT,
      air_date TEXT,
      still_url TEXT,
      runtime_minutes INTEGER,
      watched_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, provider_id),
      UNIQUE (series_id, season_number, episode_number)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_watchlist_added ON watchlist_entries(added_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_movie_watches_date ON movie_watches(watched_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_tracked_series_updated ON tracked_series(updated_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_tracked_episodes_series_order ON tracked_episodes(series_id, season_number, episode_number);`,
    `CREATE INDEX IF NOT EXISTS idx_tracked_episodes_watched ON tracked_episodes(series_id, watched_at);`,
    `CREATE INDEX IF NOT EXISTS idx_tracked_media_updated ON tracked_media(updated_at DESC);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_media_provider_identity ON tracked_media(provider, media_type, provider_id);`,
  ],
  // Re-check the Phase 4 schema because earlier development builds may already
  // have recorded version 2 with a partial tracked_media table.
  3: [],
  4: [
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('watchlist', 'movie', 'series', 'episode')),
      entity_key TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('tmdb', 'anilist')),
      media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'series', 'anime')),
      provider_id TEXT NOT NULL,
      season_number INTEGER,
      episode_number INTEGER,
      is_deleted INTEGER NOT NULL CHECK (is_deleted IN (0, 1)),
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      UNIQUE (entity_type, entity_key)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_updated ON sync_queue(updated_at, id);`,
    `CREATE TABLE IF NOT EXISTS account_binding (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      account_id TEXT NOT NULL,
      bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ],
};

async function ensureTrackedMediaColumns(database: SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(tracked_media)');
  const present = new Set(columns.map(({ name }) => name));
  if (!present.has('id')) throw new Error('The tracked_media table is missing its stable id column.');
  const additions: [string, string][] = [
    ['provider', "TEXT NOT NULL DEFAULT 'tmdb'"], ['provider_id', "TEXT NOT NULL DEFAULT ''"],
    ['media_type', "TEXT NOT NULL DEFAULT 'movie'"], ['title', "TEXT NOT NULL DEFAULT ''"],
    ['original_title', 'TEXT'], ['overview', 'TEXT'], ['poster_url', 'TEXT'], ['backdrop_url', 'TEXT'],
    ['release_date', 'TEXT'], ['year', 'INTEGER'], ['rating', 'REAL'], ['vote_count', 'INTEGER'],
    ['runtime_minutes', 'INTEGER'], ['status', 'TEXT'], ['language', 'TEXT'],
    ['origin_countries', "TEXT NOT NULL DEFAULT '[]'"], ['genres', "TEXT NOT NULL DEFAULT '[]'"],
    ['number_of_seasons', 'INTEGER'], ['number_of_episodes', 'INTEGER'], ['season_summaries', "TEXT NOT NULL DEFAULT '[]'"],
    ['anime_format', 'TEXT'], ['anime_season', 'TEXT'], ['popularity', 'INTEGER'], ['studios', "TEXT NOT NULL DEFAULT '[]'"],
    ['episode_metadata', "TEXT NOT NULL DEFAULT 'unavailable'"], ['created_at', 'TEXT'], ['updated_at', 'TEXT'],
  ];
  for (const [name, definition] of additions) {
    if (!present.has(name)) await database.execAsync(`ALTER TABLE tracked_media ADD COLUMN ${name} ${definition};`);
  }
  await database.execAsync("UPDATE tracked_media SET provider_id = id WHERE provider_id = '';");
}

export async function runMigrations(database: SQLiteDatabase): Promise<void> {
  try {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
      const applied = await transaction.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
      const known = new Set(applied.map((row) => row.version));

      for (const [versionText, statements] of Object.entries(migrations)) {
        const version = Number(versionText);
        if (known.has(version)) continue;
        if (version === 3) {
          // Re-run CREATE TABLE IF NOT EXISTS statements from v2 to ensure all
          // child tables exist, then add columns missing from early v2 builds.
          for (const statement of migrations[2]) if (statement.startsWith('CREATE TABLE')) await transaction.execAsync(statement);
          await ensureTrackedMediaColumns(transaction);
          for (const statement of migrations[2]) if (statement.includes(' INDEX IF NOT EXISTS ')) await transaction.execAsync(statement);
        } else {
          for (const statement of statements) await transaction.execAsync(statement);
        }
        await transaction.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', version);
      }
      await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
    });
  } catch (error) {
    throw new AppError('database', 'The local database could not be initialized.', { cause: error });
  }
}
