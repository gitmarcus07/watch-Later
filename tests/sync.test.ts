import type { CatalogMedia } from '@/domain/models/media';
import type { PendingWatchStateChange, WatchStateSyncRepository, CloudWatchStateRepository } from '@/domain/models/watchState';
import { mapTmdbMovie } from '@/data/remote/tmdb/mappers';
import { SyncService } from '@/features/sync/SyncService';

const media: CatalogMedia = mapTmdbMovie({ id: 7, title: 'Film 7', overview: 'A local film', poster_path: '/poster.jpg', genres: [] });

function change(overrides: Partial<PendingWatchStateChange> = {}): PendingWatchStateChange {
  return {
    id: 1, entityType: 'watchlist', entityKey: media.id, provider: media.provider, mediaType: media.mediaType,
    providerId: media.providerId, deleted: false, updatedAt: '2026-10-06T10:00:00.000Z', media, retryCount: 0, ...overrides,
  };
}

function setup(localChanges: PendingWatchStateChange[], remoteChanges: PendingWatchStateChange[]) {
  const local: jest.Mocked<WatchStateSyncRepository> = {
    getPendingChanges: jest.fn(async () => localChanges), applyRemoteChanges: jest.fn().mockResolvedValue(undefined),
    markSynced: jest.fn().mockResolvedValue(undefined), recordSyncFailure: jest.fn().mockResolvedValue(undefined),
    bindAccount: jest.fn().mockResolvedValue(undefined), getBoundAccount: jest.fn().mockResolvedValue('account-1'),
  };
  local.markSynced.mockImplementation(async (changes) => {
    localChanges = localChanges.filter(({ id, updatedAt }) => !changes.some((change) => change.id === id && change.updatedAt === updatedAt));
  });
  const cloud: jest.Mocked<CloudWatchStateRepository> = {
    getAuthenticatedUserId: jest.fn().mockResolvedValue('account-1'),
    fetch: jest.fn().mockResolvedValue(remoteChanges), upsert: jest.fn().mockResolvedValue(undefined), getInterestedCounts: jest.fn().mockResolvedValue([]),
  };
  return { service: new SyncService(local, cloud), local, cloud, replaceLocal: (changes: PendingWatchStateChange[]) => { localChanges = changes; } };
}

describe('local-first synchronization', () => {
  it('uploads local-only changes and clears the durable pending operation', async () => {
    const localChange = change();
    const { service, local, cloud } = setup([localChange], []);
    await expect(service.sync('account-1')).resolves.toMatchObject({ uploaded: 1, downloaded: 0, status: 'synced' });
    expect(local.bindAccount).toHaveBeenCalledWith('account-1');
    expect(cloud.upsert).toHaveBeenCalledWith('account-1', [localChange]);
    expect(local.markSynced).toHaveBeenCalledWith([localChange]);
  });

  it('applies a newer remote record over an older pending local record', async () => {
    const localChange = change({ id: 4 });
    const remoteChange = change({ id: -1, updatedAt: '2026-10-06T11:00:00.000Z', deleted: true });
    const { service, local, cloud } = setup([localChange], [remoteChange]);
    await service.sync('account-1');
    expect(local.applyRemoteChanges).toHaveBeenCalledWith([remoteChange]);
    expect(local.markSynced).toHaveBeenCalledWith([localChange]);
    expect(cloud.upsert).not.toHaveBeenCalled();
  });

  it('uses local state as a deterministic tie-break and keeps newer local state', async () => {
    const localChange = change({ id: 8 });
    const remoteChange = change({ id: -1 });
    const { service, cloud } = setup([localChange], [remoteChange]);
    await service.sync('account-1');
    expect(cloud.upsert).toHaveBeenCalledWith('account-1', [localChange]);
  });

  it('merges remote-only records without creating another upload', async () => {
    const remoteChange = change({ id: -1, entityKey: 'tmdb:movie:other', providerId: 'other' });
    const { service, local, cloud } = setup([], [remoteChange]);
    await expect(service.sync('account-1')).resolves.toMatchObject({ uploaded: 0, downloaded: 1 });
    expect(local.applyRemoteChanges).toHaveBeenCalledWith([remoteChange]);
    expect(cloud.upsert).not.toHaveBeenCalled();
  });

  it('retains pending work and exposes a safe retry status after network failure', async () => {
    const localChange = change();
    const { service, local, cloud } = setup([localChange], []);
    cloud.upsert.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(service.sync('account-1')).rejects.toThrow('network unavailable');
    expect(local.recordSyncFailure).toHaveBeenCalledWith([localChange], 'Sync failed. Retrying later.');
    expect(local.markSynced).not.toHaveBeenCalled();
  });

  it('does not clear a newer rapid local mutation while an older snapshot is uploading', async () => {
    const original = change();
    const newer = change({ deleted: true, updatedAt: '2026-10-06T10:00:01.000Z' });
    const { service, cloud, local, replaceLocal } = setup([original], []);
    cloud.upsert.mockImplementation(async () => { replaceLocal([newer]); });
    await expect(service.sync('account-1')).resolves.toMatchObject({ status: 'pending' });
    expect(local.markSynced).toHaveBeenCalledWith([original]);
    expect(await local.getPendingChanges()).toEqual([newer]);
  });

  it('refuses to synchronize when the requested account differs from the live auth session', async () => {
    const { service, local, cloud } = setup([change()], []);
    cloud.getAuthenticatedUserId.mockResolvedValue('account-2');
    await expect(service.sync('account-1')).rejects.toThrow('Sign in again');
    expect(local.bindAccount).not.toHaveBeenCalled();
    expect(cloud.fetch).not.toHaveBeenCalled();
  });

  it('reports a missing session as an ended session, not a mismatched account', async () => {
    const { service, cloud } = setup([change()], []);
    cloud.getAuthenticatedUserId.mockResolvedValue(undefined);
    await expect(service.sync('account-1')).rejects.toThrow('Your session has ended');
  });
});
