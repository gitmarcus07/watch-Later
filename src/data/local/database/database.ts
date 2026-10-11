import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'watch-later.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME)
      .then(async (database) => {
        await database.execAsync('PRAGMA foreign_keys = ON;');
        await database.execAsync('PRAGMA journal_mode = WAL;');
        await runMigrations(database);
        return database;
      })
      .catch((error: unknown) => {
        databasePromise = undefined;
        throw error;
      });
  }
  return databasePromise;
}

/**
 * Wipes all local data: closes the open handle, deletes the database file,
 * and drops the cached handle so the next `getDatabase()` recreates a fresh
 * schema via migrations. Used by delete-account; never throws silently —
 * callers surface failures instead of leaving a half-deleted library.
 */
export async function resetLocalDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = undefined;
  if (existing) {
    try {
      (await existing).closeAsync();
    } catch {
      // Already closed or unusable — deletion proceeds regardless.
    }
  }
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}
