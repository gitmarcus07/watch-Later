import { AppError } from '@/domain/errors/AppError';
import type { GuestMigrationService } from './GuestMigrationService';

/** Explicit Phase 1 boundary: preserve local data; cloud migration is not yet implemented. */
export class GuestMigrationServiceStub implements GuestMigrationService {
  async prepareMigration(_accountId: string): Promise<void> {
    throw new AppError('unknown', 'Guest data migration is planned for a later phase.');
  }
  async migrateToAccount(_accountId: string): Promise<void> {
    throw new AppError('unknown', 'Guest data migration is planned for a later phase.');
  }
  async resolveConflicts(_accountId: string): Promise<void> {
    throw new AppError('unknown', 'Guest data migration is planned for a later phase.');
  }
  async markMigrationComplete(_accountId: string): Promise<void> {
    throw new AppError('unknown', 'Guest data migration is planned for a later phase.');
  }
}
