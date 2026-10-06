import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';

export function createSqliteTestAdapter() {
  const raw = new DatabaseSync(':memory:');
  const database = {
    execAsync: async (sql: string) => { raw.exec(sql); },
    runAsync: async (sql: string, ...params: (string | number | null)[]) => raw.prepare(sql).run(...params) as unknown as SQLiteRunResult,
    getAllAsync: async <T>(sql: string, ...params: (string | number | null)[]) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, ...params: (string | number | null)[]) => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    withExclusiveTransactionAsync: async (callback: (transaction: SQLiteDatabase) => Promise<void>) => {
      raw.exec('BEGIN EXCLUSIVE');
      try { await callback(database as unknown as SQLiteDatabase); raw.exec('COMMIT'); }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  return { raw, database: database as unknown as SQLiteDatabase, close: () => raw.close() };
}
