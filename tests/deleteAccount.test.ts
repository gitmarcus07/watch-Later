import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAccount, isDeleteConfirmed, signOutAfterAccountDeletion, type DeleteAccountDeps } from '@/features/auth/deleteAccount';

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
  it('removes the account first, then sweeps data, then signs out', async () => {
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
    expect(order).toEqual(['auth', 'remote', 'caches', 'local', 'notifications', 'signout']);
  });

  it('touches nothing at all when the account itself cannot be removed', async () => {
    // Otherwise the user ends up with their data wiped while the sign-in
    // survives — the "Data deleted, sign-in remains" failure mode.
    const tracking = deps({ deleteAuthUser: jest.fn().mockResolvedValue(false) });
    await expect(deleteAccount('user-123', tracking)).rejects.toThrow('Couldn’t delete your account on the server');
    expect(tracking.deleteRemoteUserData).not.toHaveBeenCalled();
    expect(tracking.clearCaches).not.toHaveBeenCalled();
    expect(tracking.resetLocalData).not.toHaveBeenCalled();
    expect(tracking.signOut).not.toHaveBeenCalled();
  });

  it('still signs out when notification cancellation fails', async () => {
    const tracking = deps({ cancelLocalNotifications: jest.fn().mockRejectedValue(new Error('no module')) });
    await deleteAccount('user-123', tracking);
    expect(tracking.signOut).toHaveBeenCalledTimes(1);
  });

  it('still completes after the account is gone when a later sweep fails', async () => {
    const tracking = deps({ deleteRemoteUserData: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(deleteAccount('user-123', tracking)).resolves.toEqual({ authDeleted: true });
    expect(tracking.resetLocalData).toHaveBeenCalledTimes(1);
    expect(tracking.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('signOutAfterAccountDeletion', () => {
  const PREFIX = 'sb-testproject-auth-token';

  beforeEach(async () => { await AsyncStorage.clear(); });

  it('wipes the stored session even when the SDK signOut bails on a dead refresh token', async () => {
    // After the auth user is deleted server-side, the refresh token is dead, so
    // signOut() fails on the refresh error *before* removing the stored
    // session. Simulate that exact SDK behaviour and assert the direct storage
    // sweep still clears the deleted account's session.
    const client = {
      auth: { signOut: jest.fn().mockRejectedValue(new Error('invalid_grant')) },
    } as unknown as NonNullable<typeof import('@/data/remote/supabase/client').supabase>;

    await AsyncStorage.setItem(`${PREFIX}`, JSON.stringify({ access_token: 'stale', user: { id: 'deleted' } }));
    await AsyncStorage.setItem(`${PREFIX}-user`, JSON.stringify({ user: { id: 'deleted' } }));
    await AsyncStorage.setItem(`${PREFIX}-flow-abc-code-verifier`, 'stale-verifier');
    await AsyncStorage.setItem('watch-later.session.v1', JSON.stringify({ session: { mode: 'guest' }, onboardingComplete: true }));

    await signOutAfterAccountDeletion(client, PREFIX);

    expect(await AsyncStorage.getItem(`${PREFIX}`)).toBeNull();
    expect(await AsyncStorage.getItem(`${PREFIX}-user`)).toBeNull();
    expect(await AsyncStorage.getItem(`${PREFIX}-flow-abc-code-verifier`)).toBeNull();
    // The app's own session key is unrelated to Supabase and must survive.
    expect(await AsyncStorage.getItem('watch-later.session.v1')).not.toBeNull();
  });
});
