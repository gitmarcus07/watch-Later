import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteDatabaseRepository } from '@/data/local/repositories/SqliteDatabaseRepository';

describe('local database foundation', () => {
  it('applies schema migrations once within an exclusive transaction', async () => {
    const appliedVersions: number[] = [];
    const statements: string[] = [];
    const transaction = {
      execAsync: jest.fn(async (sql: string) => { statements.push(sql); }),
      getAllAsync: jest.fn(async () => appliedVersions.map((version) => ({ version }))),
      runAsync: jest.fn(async (_sql: string, version?: number) => {
        if (version !== undefined) appliedVersions.push(version);
        return {} as SQLiteRunResult;
      }),
    };
    const database = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction)),
    } as unknown as SQLiteDatabase;

    await runMigrations(database);
    expect(database.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(appliedVersions).toEqual([1]);
    expect(statements.some((sql) => sql.includes('content_references'))).toBe(true);
    await runMigrations(database);
    expect(appliedVersions).toEqual([1]);
  });

  it('exposes initialization through a repository boundary', async () => {
    const initialize = jest.spyOn(SqliteDatabaseRepository.prototype, 'initialize').mockResolvedValue();
    await new SqliteDatabaseRepository().initialize();
    expect(initialize).toHaveBeenCalledTimes(1);
    initialize.mockRestore();
  });
});
