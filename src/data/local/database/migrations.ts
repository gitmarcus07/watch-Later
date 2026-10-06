import type { SQLiteDatabase } from 'expo-sqlite';
import { AppError } from '@/domain/errors/AppError';

export const DATABASE_VERSION = 1;

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
};

export async function runMigrations(database: SQLiteDatabase): Promise<void> {
  try {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
      const applied = await transaction.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
      const known = new Set(applied.map((row) => row.version));

      for (const [versionText, statements] of Object.entries(migrations)) {
        const version = Number(versionText);
        if (known.has(version)) continue;
        for (const statement of statements) await transaction.execAsync(statement);
        await transaction.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', version);
      }
      await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
    });
  } catch (error) {
    throw new AppError('database', 'The local database could not be initialized.', { cause: error });
  }
}
