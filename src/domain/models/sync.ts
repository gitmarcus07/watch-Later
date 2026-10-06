export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  status: SyncStatus;
}
