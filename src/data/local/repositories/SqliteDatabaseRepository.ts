import { getDatabase } from '@/data/local/database/database';
import type { LocalDatabaseRepository } from '@/domain/repositories/LocalDatabaseRepository';

export class SqliteDatabaseRepository implements LocalDatabaseRepository {
  async initialize(): Promise<void> {
    await getDatabase();
  }
}
