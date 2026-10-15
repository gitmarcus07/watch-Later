import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'watch-later.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
/** Set while a delete is in flight so nothing can reopen the file mid-delete. */
let pendingReset: Promise<void> | undefined;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  // Reopening during a delete would leave the file "currently open" and make
  // `deleteDatabaseAsync` fail, so wait for the delete to finish instead.
  if (pendingReset) return pendingReset.then(() => getDatabase());
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
  // Claim the gate synchronously so a concurrent `getDatabase()` cannot slip
  // in between closing the handle and deleting the file.
  let release!: () => void;
  pendingReset = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    if (existing) {
      try {
        // `closeAsync()` returns a promise — dropping it (the old code) let the
        // delete race the still-open handle, which is what produced the
        // intermittent "database … is currently open. Close it prior to
        // deletion." error.
        await (await existing).closeAsync();
      } catch {
        // Already closed or unusable — deletion proceeds regardless.
      }
    }
    await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  } finally {
    pendingReset = undefined;
    release();
  }
}

/**
 * Clears the device library so a brand-new account can bind. Prefers a full
 * file reset; when that fails (e.g. the file is locked), falls back to
 * deleting library rows + the account binding via SQL. The global OTT cache
 * is intentionally kept — only per-device library state is cleared.
 */
export async function clearDeviceLibrary(): Promise<void> {
  try {
    await resetLocalDatabase();
    await getDatabase();
  } catch {
    // Fall through to the SQL sweep below.
  }
  try {
    const db = await getDatabase();
    // Order matters: binding + queue first, then media (cascades to
    // watchlist/watches/favorites/ratings/interest/episodes), then the
    // remaining library-owned tables.
    await db.runAsync('DELETE FROM account_binding;').catch(() => undefined);
    await db.runAsync('DELETE FROM sync_queue;').catch(() => undefined);
    await db.runAsync('DELETE FROM tracked_media;').catch(() => undefined);
    await db.runAsync('DELETE FROM custom_lists;').catch(() => undefined);
    await db.runAsync('DELETE FROM list_folders;').catch(() => undefined);
    await db.runAsync('DELETE FROM deleted_items;').catch(() => undefined);
    await db.runAsync('DELETE FROM sync_metadata;').catch(() => undefined);
  } catch {
    // Best effort: callers retry the bind and surface any failure there.
  }
}
