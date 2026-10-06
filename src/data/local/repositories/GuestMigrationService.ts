export interface GuestMigrationService {
  prepareMigration(accountId: string): Promise<void>;
  migrateToAccount(accountId: string): Promise<void>;
  resolveConflicts(accountId: string): Promise<void>;
  markMigrationComplete(accountId: string): Promise<void>;
}
