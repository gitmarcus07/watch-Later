import { SupabaseAuthService, DeviceLinkedError, EXISTING_ACCOUNT_NOTICE, isExistingAccountUser, parseOAuthRedirect, resolveOAuthRedirectUri } from '@/features/auth/SupabaseAuthService';
import type { GuestMigrationService } from '@/data/local/repositories/GuestMigrationService';

const user = { id: 'user-123', email: 'viewer@example.test' };
const session = { user };

function migration(failAccountBind = false): jest.Mocked<GuestMigrationService> {
  return {
    prepareMigration: jest.fn().mockResolvedValue(undefined),
    migrateToAccount: failAccountBind ? jest.fn().mockRejectedValue(new Error('library already bound')) : jest.fn().mockResolvedValue(undefined),
    resolveConflicts: jest.fn().mockResolvedValue(undefined),
    markMigrationComplete: jest.fn().mockResolvedValue(undefined),
  };
}

function authClient() {
  return {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user, session }, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user, session }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe('optional Supabase authentication', () => {
  it('continues as guest without requiring Supabase configuration', async () => {
    await expect(new SupabaseAuthService(null).continueAsGuest()).resolves.toMatchObject({ mode: 'guest', userId: expect.stringMatching(/^guest-/) });
  });

  it('signs in, preserves email identity, and starts the guest merge', async () => {
    const client = authClient();
    const migrationService = migration();
    const service = new SupabaseAuthService(client, migrationService);
    await expect(service.signIn('viewer@example.test', 'test-password')).resolves.toEqual({ mode: 'authenticated', userId: user.id, email: user.email });
    expect(migrationService.migrateToAccount).toHaveBeenCalledWith(user.id);
  });

  it('maps sign-in errors to a safe message', async () => {
    const client = authClient();
    client.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'raw provider diagnostic' } });
    await expect(new SupabaseAuthService(client, migration()).signIn('viewer@example.test', 'wrong')).rejects.toThrow('Email or password is incorrect');
  });

  it('creates an account and merges the local library after authentication', async () => {
    const client = authClient();
    // A genuinely new email: the sign-in probe fails, so signup proceeds.
    client.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'no such user' } });
    const migrationService = migration();
    await expect(new SupabaseAuthService(client, migrationService).createAccount('brand-new@example.test', 'test-password'))
      .resolves.toEqual({ mode: 'authenticated', userId: user.id, email: user.email });
    expect(client.auth.signUp).toHaveBeenCalled();
    expect(migrationService.migrateToAccount).toHaveBeenCalledWith(user.id);
  });

  it('treats "create account" with an existing email + password as a sign-in, not a signup', async () => {
    const client = authClient(); // sign-in probe succeeds => account already exists
    const migrationService = migration();
    await expect(new SupabaseAuthService(client, migrationService).createAccount('viewer@example.test', 'test-password'))
      .resolves.toMatchObject({ mode: 'authenticated', userId: user.id, notice: EXISTING_ACCOUNT_NOTICE });
    expect(client.auth.signInWithPassword).toHaveBeenCalled();
    expect(client.auth.signUp).not.toHaveBeenCalled();
    expect(migrationService.migrateToAccount).toHaveBeenCalledWith(user.id);
  });

  it('keeps a guest session when email confirmation is required', async () => {
    const client = authClient();
    client.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'no such user' } });
    client.auth.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    const migrationService = migration();
    await expect(new SupabaseAuthService(client, migrationService).createAccount('viewer@example.test', 'test-password')).rejects.toThrow('Check your email');
    expect(migrationService.migrateToAccount).not.toHaveBeenCalled();
  });

  it('signs out after account-binding refusal without running a sync', async () => {
    const client = authClient();
    const migrationService = migration(true);
    await expect(new SupabaseAuthService(client, migrationService).signIn('viewer@example.test', 'test-password')).rejects.toThrow('library already bound');
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('provides a controlled configuration error when account features are not configured', async () => {
    await expect(new SupabaseAuthService(null).signIn('viewer@example.test', 'pass')).rejects.toMatchObject({ kind: 'configuration' });
  });
});

describe('OAuth redirect URI resolution', () => {
  it('uses one stable custom-scheme URL in dev clients and production builds', () => {
    expect(resolveOAuthRedirectUri({ isExpoGo: false })).toBe('watchlater://auth/callback');
    expect(resolveOAuthRedirectUri({ isExpoGo: false, hostUri: '192.168.1.5:8082' }))
      .toBe('watchlater://auth/callback');
  });

  it('uses the live dev-server session URL inside Expo Go', () => {
    expect(resolveOAuthRedirectUri({ isExpoGo: true, hostUri: '192.168.1.5:8081' }))
      .toBe('exp://192.168.1.5:8081/--/auth/callback');
  });

  it('strips query params from the Expo Go host before building the session URL', () => {
    expect(resolveOAuthRedirectUri({ isExpoGo: true, hostUri: '192.168.1.5:8081?release-channel=default' }))
      .toBe('exp://192.168.1.5:8081/--/auth/callback');
  });

  it('falls back to the custom scheme in Expo Go without a host', () => {
    expect(resolveOAuthRedirectUri({ isExpoGo: true })).toBe('watchlater://auth/callback');
  });
});

describe('Google sign-in redirect parsing', () => {  it('reads the PKCE code from the query string', () => {
    expect(parseOAuthRedirect('watchlater://auth/callback?code=abc123')).toMatchObject({ code: 'abc123' });
  });

  it('reads implicit tokens from the fragment', () => {
    expect(parseOAuthRedirect('watchlater://auth/callback#access_token=at&refresh_token=rt&token_type=bearer'))
      .toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
  });

  it('reads provider errors', () => {
    expect(parseOAuthRedirect('watchlater://auth/callback?error=access_denied&error_description=Declined'))
      .toMatchObject({ error: 'access_denied', errorDescription: 'Declined' });
  });

  it('returns empty params for a malformed URL', () => {
    expect(parseOAuthRedirect('not a url')).toEqual({});
  });
});

describe('Google sign-in flow', () => {
  function oauthClient(overrides: Record<string, unknown> = {}) {
    return {
      auth: {
        ...authClient().auth,
        signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://accounts.google.test/o/oauth2/auth' }, error: null }),
        exchangeCodeForSession: jest.fn().mockResolvedValue({ error: null }),
        setSession: jest.fn().mockResolvedValue({ error: null }),
        getUser: jest.fn().mockResolvedValue({ data: { user } }),
        ...overrides,
      },
    };
  }

  function oauthDeps(result: { type: string; url?: string }) {
    return { redirectUri: 'watchlater://auth/callback', browser: { openAuthSessionAsync: jest.fn().mockResolvedValue(result) } };
  }

  it('exchanges the PKCE code and merges the local library', async () => {
    const client = oauthClient();
    const migrationService = migration();
    const service = new SupabaseAuthService(client, migrationService, oauthDeps({ type: 'success', url: 'watchlater://auth/callback?code=abc123' }));
    await expect(service.signInWithGoogle()).resolves.toEqual({ mode: 'authenticated', userId: user.id, email: user.email });
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(migrationService.migrateToAccount).toHaveBeenCalledWith(user.id);
  });

  it('treats a dismissed browser as a cancellation, not an error report', async () => {
    const service = new SupabaseAuthService(oauthClient(), migration(), oauthDeps({ type: 'dismiss' }));
    await expect(service.signInWithGoogle()).rejects.toThrow('Google sign-in was cancelled');
  });

  it('surfaces provider-declined redirects', async () => {
    const service = new SupabaseAuthService(
      oauthClient(),
      migration(),
      oauthDeps({ type: 'success', url: 'watchlater://auth/callback?error=access_denied&error_description=Declined+by+user' }),
    );
    await expect(service.signInWithGoogle()).rejects.toThrow('Declined by user');
  });

  it('falls back to implicit tokens via setSession when no code is returned', async () => {
    const client = oauthClient({
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn().mockResolvedValue({ error: null }),
    });
    const service = new SupabaseAuthService(
      client,
      migration(),
      oauthDeps({ type: 'success', url: 'watchlater://auth/callback#access_token=at&refresh_token=rt' }),
    );
    await expect(service.signInWithGoogle()).resolves.toMatchObject({ mode: 'authenticated', userId: user.id });
    expect(client.auth.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('rejects a success redirect that carries no session parameters', async () => {
    const service = new SupabaseAuthService(
      oauthClient(),
      migration(),
      oauthDeps({ type: 'success', url: 'watchlater://auth/callback?state=xyz' }),
    );
    await expect(service.signInWithGoogle()).rejects.toThrow('did not return a session');
  });

  it('rejects when the code exchange fails without marking the user authenticated', async () => {
    const client = oauthClient();
    client.auth.exchangeCodeForSession.mockResolvedValue({ error: { code: 'bad_code', message: 'expired' } });
    const service = new SupabaseAuthService(
      client,
      migration(),
      oauthDeps({ type: 'success', url: 'watchlater://auth/callback?code=stale' }),
    );
    await expect(service.signInWithGoogle()).rejects.toThrow('Unable to sign in');
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it('rejects when the authorize URL cannot be started', async () => {
    const client = oauthClient();
    client.auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    const service = new SupabaseAuthService(client, migration(), oauthDeps({ type: 'success', url: '' }));
    await expect(service.signInWithGoogle()).rejects.toThrow('Unable to sign in');
  });
});

describe('create account with an email that already exists', () => {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  /** Fails the sign-in probe so the test exercises the signUp fallback path. */
  function probeFails() {
    const client = authClient();
    client.auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'no such user' } });
    return client;
  }

  it('still treats a signUp that auto-signs-in an old account as a sign-in', async () => {
    const client = probeFails();
    client.auth.signUp.mockResolvedValue({ data: { user: { ...user, created_at: dayAgo }, session }, error: null });
    await expect(new SupabaseAuthService(client, migration()).createAccount('viewer@example.test', 'test-password'))
      .resolves.toMatchObject({ mode: 'authenticated', userId: user.id, notice: EXISTING_ACCOUNT_NOTICE });
  });

  it('flags a signUp that resolved to an existing identity', async () => {
    const client = probeFails();
    client.auth.signUp.mockResolvedValue({ data: { user: { ...user, identities: [] }, session }, error: null });
    await expect(new SupabaseAuthService(client, migration()).createAccount('viewer@example.test', 'test-password'))
      .resolves.toMatchObject({ notice: EXISTING_ACCOUNT_NOTICE });
  });

  it('keeps a genuinely fresh signup free of notices', async () => {
    await expect(new SupabaseAuthService(probeFails(), migration()).createAccount('brand-new@example.test', 'test-password'))
      .resolves.toEqual({ mode: 'authenticated', userId: user.id, email: user.email });
  });

  it('maps the newer already-registered error code to a sign-in nudge', async () => {
    const client = probeFails();
    client.auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'raw diagnostic' } });
    await expect(new SupabaseAuthService(client, migration()).createAccount('viewer@example.test', 'test-password')).rejects.toThrow('Sign in instead');
  });

  it('recognises existing accounts by age and by identity resolution', () => {
    expect(isExistingAccountUser({ created_at: dayAgo })).toBe(true);
    expect(isExistingAccountUser({ identities: [] })).toBe(true);
    expect(isExistingAccountUser({ created_at: new Date().toISOString() })).toBe(false);
    expect(isExistingAccountUser({})).toBe(false);
    expect(isExistingAccountUser(null)).toBe(false);
  });
});

describe('Google sign-in with no live account', () => {
  function noAccountClient() {
    return {
      auth: {
        ...authClient().auth,
        signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://accounts.google.test/o/oauth2/auth' }, error: null }),
        exchangeCodeForSession: jest.fn().mockResolvedValue({ error: null }),
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    };
  }

  it('turns a sign-in without an account into the "no account found" prompt', async () => {
    const deps = { redirectUri: 'watchlater://auth/callback', browser: { openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'success', url: 'watchlater://auth/callback?code=abc123' }) } };
    const service = new SupabaseAuthService(noAccountClient(), migration(), deps);
    await expect(service.signInWithGoogle('sign-in')).rejects.toThrow('couldn’t find an account');
  });

  it('rolls the orphaned session back so nothing lingers on the device', async () => {
    const client = noAccountClient();
    const deps = { redirectUri: 'watchlater://auth/callback', browser: { openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'success', url: 'watchlater://auth/callback?code=abc123' }) } };
    const service = new SupabaseAuthService(client, migration(), deps);
    await expect(service.signInWithGoogle('sign-in')).rejects.toThrow('couldn’t find an account');
    expect(client.auth.signOut).toHaveBeenCalled();
  });
});

describe('signing into a different account on the same device', () => {
  const linked = new DeviceLinkedError('account-b', 'b@example.test');

  /** Migration that refuses the bind the first time (device owned by another account) then succeeds after a repair. */
  function linkedThenBinds() {
    let refused = false;
    return {
      prepareMigration: jest.fn().mockResolvedValue(undefined),
      migrateToAccount: jest.fn().mockImplementation(async () => {
        if (!refused) { refused = true; throw linked; }
      }),
      resolveConflicts: jest.fn().mockResolvedValue(undefined),
      markMigrationComplete: jest.fn().mockResolvedValue(undefined),
    };
  }

  function alwaysLinked() {
    return { prepareMigration: jest.fn(), migrateToAccount: jest.fn().mockRejectedValue(linked), resolveConflicts: jest.fn(), markMigrationComplete: jest.fn() };
  }

  it('switches seamlessly when the previous account has nothing unsynced', async () => {
    const migrationService = linkedThenBinds();
    const repair = jest.fn().mockResolvedValue(undefined);
    const service = new SupabaseAuthService(authClient(), migrationService, null, repair, async () => false);
    await expect(service.signIn('b@example.test', 'test-password')).resolves.toMatchObject({ mode: 'authenticated', userId: user.id });
    expect(repair).toHaveBeenCalled();
    expect(migrationService.migrateToAccount).toHaveBeenCalledTimes(2);
  });

  it('still warns before clearing when the previous account has unsynced changes', async () => {
    const migrationService = alwaysLinked();
    const repair = jest.fn().mockResolvedValue(undefined);
    const service = new SupabaseAuthService(authClient(), migrationService, null, repair, async () => true);
    await expect(service.signIn('b@example.test', 'test-password')).rejects.toThrow('linked to another account');
    expect(repair).not.toHaveBeenCalled();
  });

  it('falls back to warning when the pending-changes check itself fails', async () => {
    const migrationService = alwaysLinked();
    const repair = jest.fn().mockResolvedValue(undefined);
    const service = new SupabaseAuthService(authClient(), migrationService, null, repair, async () => { throw new Error('db unreadable'); });
    await expect(service.signIn('b@example.test', 'test-password')).rejects.toThrow('linked to another account');
    expect(repair).not.toHaveBeenCalled();
  });
});
