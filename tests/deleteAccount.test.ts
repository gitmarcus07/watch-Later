import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAccount, isDeleteConfirmed, markAccountDeleted, getLastDeletedAccount, clearLastDeletedAccount, signOutAfterAccountDeletion, verifyAuthUserDeleted, type DeleteAccountDeps } from '@/features/auth/deleteAccount';

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

  it('records the deletion before any best-effort sweep can fail', async () => {
    await AsyncStorage.clear();
    const tracking = deps({ deleteRemoteUserData: jest.fn().mockRejectedValue(new Error('offline')) });
    await deleteAccount('user-123', tracking);
    // Even with the sweeps failing, the record exists so the next sign-in
    // repairs leftovers silently and a lost Google intent resolves as sign-in.
    expect(await getLastDeletedAccount()).toBe('user-123');
  });
});

describe('verifyAuthUserDeleted', () => {
  const client = (auth: Record<string, unknown>) => ({ auth }) as unknown as NonNullable<typeof import('@/data/remote/supabase/client').supabase>;

  it('blocks deletion when the auth user still exists', async () => {
    await expect(verifyAuthUserDeleted(client({ getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }) })))
      .resolves.toBe(false);
  });

  it('confirms deletion when the user no longer resolves server-side', async () => {
    await expect(verifyAuthUserDeleted(client({ getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'User not found' } }) })))
      .resolves.toBe(true);
  });

  it('cannot confirm when the check itself failed on the network (offline aborts safely)', async () => {
    await expect(verifyAuthUserDeleted(client({ getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Failed to fetch' } }) })))
      .resolves.toBe(false);
    await expect(verifyAuthUserDeleted(client({ getUser: jest.fn().mockRejectedValue(new Error('Network request failed')) })))
      .resolves.toBe(false);
  });

  it('trusts the edge function when there is no way to ask', async () => {
    await expect(verifyAuthUserDeleted(client({}))).resolves.toBe(true);
  });
});

describe('last-deleted-account record', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('round-trips and clears the record', async () => {
    expect(await getLastDeletedAccount()).toBeNull();
    await markAccountDeleted('user-123');
    expect(await getLastDeletedAccount()).toBe('user-123');
    await clearLastDeletedAccount();
    expect(await getLastDeletedAccount()).toBeNull();
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
