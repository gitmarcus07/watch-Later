import { deleteAccount, isDeleteConfirmed, type DeleteAccountDeps } from '@/features/auth/deleteAccount';

function deps(overrides: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps {
  return {
    deleteRemoteUserData: jest.fn().mockResolvedValue(undefined),
    deleteAuthUser: jest.fn().mockResolvedValue(true),
    resetLocalData: jest.fn().mockResolvedValue(undefined),
    cancelLocalNotifications: jest.fn().mockResolvedValue(undefined),
    clearCaches: jest.fn().mockResolvedValue(undefined),
    signOut: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('delete confirmation phrase', () => {
  it('matches the account email case-insensitively', () => {
    expect(isDeleteConfirmed('Viewer@Example.test ', 'viewer@example.test')).toBe(true);
  });

  it('rejects mismatches and empty emails', () => {
    expect(isDeleteConfirmed('someone@else.test', 'viewer@example.test')).toBe(false);
    expect(isDeleteConfirmed('', '')).toBe(false);
    expect(isDeleteConfirmed('', 'viewer@example.test')).toBe(false);
  });
});

describe('deleteAccount', () => {
  it('wipes remote data first, then local state, then signs out', async () => {
    const order: string[] = [];
    const tracking = deps({
      deleteRemoteUserData: jest.fn().mockImplementation(async () => { order.push('remote'); }),
      deleteAuthUser: jest.fn().mockImplementation(async () => { order.push('auth'); return true; }),
      resetLocalData: jest.fn().mockImplementation(async () => { order.push('local'); }),
      cancelLocalNotifications: jest.fn().mockImplementation(async () => { order.push('notifications'); }),
      clearCaches: jest.fn().mockImplementation(async () => { order.push('caches'); }),
      signOut: jest.fn().mockImplementation(async () => { order.push('signout'); }),
    });
    await expect(deleteAccount('user-123', tracking)).resolves.toEqual({ authDeleted: true });
    expect(order).toEqual(['remote', 'auth', 'local', 'notifications', 'caches', 'signout']);
  });

  it('aborts before touching local state when the remote wipe fails', async () => {
    const tracking = deps({ deleteRemoteUserData: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(deleteAccount('user-123', tracking)).rejects.toThrow('offline');
    expect(tracking.deleteAuthUser).not.toHaveBeenCalled();
    expect(tracking.resetLocalData).not.toHaveBeenCalled();
    expect(tracking.signOut).not.toHaveBeenCalled();
  });

  it('still signs out when notification cancellation fails', async () => {
    const tracking = deps({ cancelLocalNotifications: jest.fn().mockRejectedValue(new Error('no module')) });
    await deleteAccount('user-123', tracking);
    expect(tracking.signOut).toHaveBeenCalledTimes(1);
  });

  it('reports when the server-side sign-in removal did not run', async () => {
    const tracking = deps({ deleteAuthUser: jest.fn().mockResolvedValue(false) });
    await expect(deleteAccount('user-123', tracking)).resolves.toEqual({ authDeleted: false });
    // Data wipe + sign-out still complete so nothing is left half-deleted.
    expect(tracking.resetLocalData).toHaveBeenCalledTimes(1);
    expect(tracking.signOut).toHaveBeenCalledTimes(1);
  });
});
