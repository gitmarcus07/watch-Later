import type { CatalogMedia } from '@/domain/models/media';
import type { CloudWatchStateRepository, PendingWatchStateChange, WatchStateSyncRepository } from '@/domain/models/watchState';
import { AppError } from '@/domain/errors/AppError';
import { mapTmdbMovie } from '@/data/remote/tmdb/mappers';
import { SyncService } from '@/features/sync/SyncService';
import { AUTO_SYNC_DEBOUNCE_MS, AutoSyncScheduler } from '@/features/sync/autoSync';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

const media: CatalogMedia = mapTmdbMovie({ id: 7, title: 'Film 7', overview: 'A local film', poster_path: '/poster.jpg', genres: [] });

function change(overrides: Partial<PendingWatchStateChange> = {}): PendingWatchStateChange {
  return {
    id: 1, entityType: 'watchlist', entityKey: media.id, provider: media.provider, mediaType: media.mediaType,
    providerId: media.providerId, deleted: false, updatedAt: '2026-10-06T10:00:00.000Z', media, retryCount: 0, ...overrides,
  };
}

function setupSyncService(localChanges: PendingWatchStateChange[], remoteChanges: PendingWatchStateChange[]) {
  let pending = [...localChanges];
  const local: jest.Mocked<WatchStateSyncRepository> = {
    getPendingChanges: jest.fn(async () => pending),
    applyRemoteChanges: jest.fn().mockResolvedValue(undefined),
    markSynced: jest.fn().mockImplementation(async (changes: PendingWatchStateChange[]) => {
      pending = pending.filter(({ id, updatedAt }) => !changes.some((c) => c.id === id && c.updatedAt === updatedAt));
    }),
    recordSyncFailure: jest.fn().mockResolvedValue(undefined),
    bindAccount: jest.fn().mockResolvedValue(undefined),
    getBoundAccount: jest.fn().mockResolvedValue('account-1'),
  };
  const cloud: jest.Mocked<CloudWatchStateRepository> = {
    getAuthenticatedUserId: jest.fn().mockResolvedValue('account-1'),
    fetch: jest.fn().mockResolvedValue(remoteChanges),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new SyncService(local, cloud), local, cloud, setPending: (c: PendingWatchStateChange[]) => { pending = c; } };
}

function setupScheduler(session: { mode: string; userId?: string }, sync: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  let now = 1_000_000;
  const getSession = jest.fn(() => session);
  const scheduler = new AutoSyncScheduler({ getSession, sync, now: () => now });
  return { scheduler, sync, getSession, setSession: (s: { mode: string; userId?: string }) => { session = s; }, advanceTime: (ms: number) => { now += ms; } };
}

async function flushSync() {
  await jest.advanceTimersByTimeAsync(AUTO_SYNC_DEBOUNCE_MS);
  // Allow the debounced async sync to settle.
  await Promise.resolve();
  await Promise.resolve();
}

describe('automatic background sync', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

  it('1. authenticated local mutation schedules a background sync', async () => {
    const { scheduler, sync } = setupScheduler({ mode: 'authenticated', userId: 'account-1' });
    scheduler.schedule('mutation');
    expect(sync).not.toHaveBeenCalled();
    await flushSync();
    expect(sync).toHaveBeenCalledWith('account-1');
  });

  it('2. guest mutation never schedules cloud sync', async () => {
    const { scheduler, sync } = setupScheduler({ mode: 'guest', userId: 'guest-1' });
    scheduler.schedule('mutation');
    await flushSync();
    expect(sync).not.toHaveBeenCalled();
  });

  it('3. pending queue is synced after authentication', async () => {
    let session: { mode: string; userId?: string } = { mode: 'guest', userId: 'guest-1' };
    const sync = jest.fn().mockResolvedValue(undefined);
    const scheduler = new AutoSyncScheduler({ getSession: () => session, sync });
    scheduler.schedule('mutation');
    // User signs in before the debounced sync fires.
    session = { mode: 'authenticated', userId: 'account-1' };
    await flushSync();
    expect(sync).toHaveBeenCalledWith('account-1');
  });

  it('4. foreground event triggers a sync with cooldown', async () => {
    const { scheduler, sync } = setupScheduler({ mode: 'authenticated', userId: 'account-1' });
    scheduler.handleForeground();
    await flushSync();
    expect(sync).toHaveBeenCalledTimes(1);
    // Rapid second foreground within cooldown is ignored.
    scheduler.handleForeground();
    await flushSync();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('5. connectivity restoration triggers a sync once', async () => {
    const { scheduler, sync } = setupScheduler({ mode: 'authenticated', userId: 'account-1' });
    scheduler.handleConnectivity(false);
    await flushSync();
    expect(sync).not.toHaveBeenCalled();
    scheduler.handleConnectivity(true);
    await flushSync();
    expect(sync).toHaveBeenCalledTimes(1);
    // Staying online does not schedule duplicates.
    scheduler.handleConnectivity(true);
    await flushSync();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('6. multiple rapid triggers coalesce into one sync operation', async () => {
    const { scheduler, sync } = setupScheduler({ mode: 'authenticated', userId: 'account-1' });
    scheduler.schedule('mutation');
    scheduler.schedule('foreground');
    scheduler.schedule('connectivity');
    await flushSync();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('7. new work arriving during an active sync is not lost', async () => {
    const original = change();
    const newer = change({ deleted: true, updatedAt: '2026-10-06T10:00:01.000Z' });
    const { service, cloud, local, setPending } = setupSyncService([original], []);
    cloud.upsert.mockImplementation(async () => { setPending([newer]); });
    await expect(service.sync('account-1')).resolves.toMatchObject({ status: 'pending' });
    expect(local.markSynced).toHaveBeenCalledWith([original]);
    expect(await local.getPendingChanges()).toEqual([newer]);
  });

  it('8. offline failures preserve queued work', async () => {
    const localChange = change();
    const offline = new AppError('network', 'Could not download your synced library. Your local data is safe.');
    const failing = setupSyncService([localChange], []);
    failing.cloud.fetch.mockRejectedValueOnce(offline);
    await expect(failing.service.sync('account-1')).rejects.toThrow();
    expect(failing.local.markSynced).not.toHaveBeenCalled();
    expect(failing.local.recordSyncFailure).toHaveBeenCalled();
  });

  it('9. successful sync clears completed queue items', async () => {
    const localChange = change();
    const { service, local, cloud } = setupSyncService([localChange], []);
    await expect(service.sync('account-1')).resolves.toMatchObject({ uploaded: 1, status: 'synced' });
    expect(cloud.upsert).toHaveBeenCalledWith('account-1', [localChange]);
    expect(local.markSynced).toHaveBeenCalledWith([localChange]);
    expect(await local.getPendingChanges()).toEqual([]);
  });

  it('10. manual Sync now still works via SyncService directly', async () => {
    const localChange = change();
    const { service, cloud } = setupSyncService([localChange], []);
    // Manual path bypasses the debounce scheduler and calls SyncService directly.
    await expect(service.sync('account-1')).resolves.toMatchObject({ uploaded: 1 });
    expect(cloud.upsert).toHaveBeenCalledWith('account-1', [localChange]);
  });

  it('11. conflict resolution still favors newer remote and local tie-break', async () => {
    const { service: newerRemoteService, local: newerRemoteLocal, cloud: newerRemoteCloud } = setupSyncService(
      [change({ id: 4 })],
      [change({ id: -1, updatedAt: '2026-10-06T11:00:00.000Z', deleted: true })],
    );
    await newerRemoteService.sync('account-1');
    expect(newerRemoteLocal.applyRemoteChanges).toHaveBeenCalled();
    expect(newerRemoteCloud.upsert).not.toHaveBeenCalled();

    const { service: tieService, cloud: tieCloud } = setupSyncService(
      [change({ id: 8 })],
      [change({ id: -1 })],
    );
    await tieService.sync('account-1');
    expect(tieCloud.upsert).toHaveBeenCalled();
  });

  it('concurrent scheduler triggers do not run concurrent syncs', async () => {
    let active = 0;
    let maxActive = 0;
    const sync = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });
    const scheduler = new AutoSyncScheduler({ getSession: () => ({ mode: 'authenticated', userId: 'account-1' }), sync });
    scheduler.schedule('mutation');
    scheduler.schedule('foreground');
    scheduler.schedule('connectivity');
    await flushSync();
    expect(maxActive).toBeLessThanOrEqual(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
