import { AppError } from '@/domain/errors/AppError';
import type { GuestMigrationService } from './GuestMigrationService';
import { watchStateSyncRepository } from './SqliteWatchStateRepository';
import { syncService } from '@/features/sync/SyncService';

/** Binds the existing local library and leaves all retryable work in the durable outbox. */
export class SqliteGuestMigrationService implements GuestMigrationService {
  async prepareMigration(accountId: string): Promise<void> {
    await watchStateSyncRepository.bindAccount(accountId);
  }

  async migrateToAccount(accountId: string): Promise<void> {
    await this.prepareMigration(accountId);
    // Authentication remains successful when cloud access is temporarily unavailable.
    void syncService.sync(accountId).catch(() => undefined);
  }

  async resolveConflicts(accountId: string): Promise<void> {
    await syncService.sync(accountId);
  }

  async markMigrationComplete(_accountId: string): Promise<void> {
    if ((await watchStateSyncRepository.getPendingChanges()).length) {
      throw new AppError('network', 'Your library is saved locally and will finish syncing when the connection returns.');
    }
  }
}
