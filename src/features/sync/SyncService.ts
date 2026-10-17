import type { CloudWatchStateRepository, PendingWatchStateChange, WatchStateSyncRepository } from '@/domain/models/watchState';
import type { SyncResult } from '@/domain/models/sync';
import { AppError } from '@/domain/errors/AppError';
import { useSyncStore } from '@/store/app/syncStore';
import { watchStateSyncRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { cloudWatchStateRepository } from '@/data/remote/supabase/SupabaseWatchStateRepository';
import { queryClient } from '@/lib/query/queryClient';
import { showFriendlyError } from '@/lib/friendlyError';
import { isLocalLibraryPrepFailure, LOCAL_LIBRARY_PREP_NOTICE, LOCAL_LIBRARY_PREP_TITLE } from '@/lib/localLibraryNotice';

function identity(change: PendingWatchStateChange): string {
  return `${change.entityType}:${change.entityKey}`;
}

function newer(left: PendingWatchStateChange, right: PendingWatchStateChange): boolean {
  const order = Date.parse(normalizeTime(left.updatedAt)) - Date.parse(normalizeTime(right.updatedAt));
  return order > 0 || (order === 0 && left.id >= right.id);
}

function normalizeTime(value: string): string {
  return value.includes(' ') && !value.includes('T') ? `${value.replace(' ', 'T')}Z` : value;
}

export class SyncService {
  private activeSync?: Promise<SyncResult>;
  private rerunForUser?: string;

  constructor(private readonly local: WatchStateSyncRepository, private readonly cloud: CloudWatchStateRepository) {}

  sync(userId: string): Promise<SyncResult> {
    if (this.activeSync) {
      this.rerunForUser = userId;
      return this.activeSync;
    }
    this.activeSync = this.performSync(userId).finally(() => {
      this.activeSync = undefined;
      const retryUser = this.rerunForUser;
      this.rerunForUser = undefined;
      if (retryUser) {
        void this.sync(retryUser).catch((cause: unknown) => {
          // The overlapping caller already got its own result, so this rerun's
          // failure has no awaiter — "Couldn't prepare this account's local
          // library." would never reach a prompt. Same title + copy as the
          // other surfaces, so showFriendlyError collapses any overlap.
          if (isLocalLibraryPrepFailure(cause)) {
            void showFriendlyError(cause, LOCAL_LIBRARY_PREP_TITLE, { message: LOCAL_LIBRARY_PREP_NOTICE });
          }
        });
      }
    });
    return this.activeSync;
  }

  private async performSync(userId: string): Promise<SyncResult> {
    useSyncStore.getState().setSyncState('syncing');
    let pending: PendingWatchStateChange[] = [];
    try {
      const authenticatedUserId = await this.cloud.getAuthenticatedUserId();
      // Missing session and mismatched account are different problems: the
      // first means the token is gone (expired, revoked, or signed out), the
      // second means this library belongs to someone else. Both are only
      // solvable by signing in again.
      if (!authenticatedUserId) throw new AppError('authentication', 'Your session has ended. Sign in again to sync your library.');
      if (authenticatedUserId !== userId) throw new AppError('authentication', 'Sign in again to sync this library.');
      await this.local.bindAccount(userId);
      pending = await this.local.getPendingChanges();
      const remote = await this.cloud.fetch(userId);
      const pendingByIdentity = new Map(pending.map((change) => [identity(change), change]));
      const remoteWins: PendingWatchStateChange[] = [];
      const remoteOnly: PendingWatchStateChange[] = [];
      const localWins: PendingWatchStateChange[] = [];
      const remoteSeen = new Set<string>();

      for (const remoteChange of remote) {
        const key = identity(remoteChange);
        remoteSeen.add(key);
        const localChange = pendingByIdentity.get(key);
        if (!localChange) remoteOnly.push(remoteChange);
        else if (newer(remoteChange, localChange)) remoteWins.push(remoteChange);
        else localWins.push(localChange);
      }
      for (const localChange of pending) if (!remoteSeen.has(identity(localChange))) localWins.push(localChange);

      if (remoteWins.length || remoteOnly.length) {
        await this.local.applyRemoteChanges([...remoteWins, ...remoteOnly]);
        void queryClient.invalidateQueries({ queryKey: ['watch'] });
      }
      const supersededLocalChanges = remoteWins.map((change) => pendingByIdentity.get(identity(change))).filter((change): change is PendingWatchStateChange => change !== undefined);
      if (supersededLocalChanges.length) await this.local.markSynced(supersededLocalChanges);
      if (localWins.length) {
        await this.cloud.upsert(userId, localWins);
        await this.local.markSynced(localWins);
      }

      const remaining = await this.local.getPendingChanges();
      if (remaining.length) {
        useSyncStore.getState().setSyncState('pending', 'Some changes are waiting to sync.');
        return { uploaded: localWins.length, downloaded: remoteWins.length + remoteOnly.length, status: 'pending' };
      }
      useSyncStore.getState().markSynced();
      return { uploaded: localWins.length, downloaded: remoteWins.length + remoteOnly.length, status: 'synced' };
    } catch (error) {
      if (pending.length) {
        try { await this.local.recordSyncFailure(pending, 'Sync failed. Retrying later.'); } catch { /* Keep the original sync failure visible. */ }
      }
      const message = error instanceof AppError ? error.message : 'Sync failed. Your local changes are safe and will retry.';
      useSyncStore.getState().setSyncState(error instanceof AppError && error.kind === 'network' ? 'offline' : 'error', message);
      throw error;
    }
  }
}

export const syncService = new SyncService(watchStateSyncRepository, cloudWatchStateRepository);
