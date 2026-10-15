import { create } from 'zustand';
import type { SyncStatus } from '@/domain/models/sync';

interface SyncStore {
  status: SyncStatus;
  lastSyncedAt?: string;
  message?: string;
  setSyncState: (status: SyncStatus, message?: string) => void;
  markSynced: () => void;
  /** Clears any stale status (sign-out, account switch, account deletion). */
  reset: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  setSyncState: (status, message) => set({ status, message }),
  markSynced: () => set({ status: 'synced', lastSyncedAt: new Date().toISOString(), message: undefined }),
  reset: () => set({ status: 'idle', message: undefined }),
}));
