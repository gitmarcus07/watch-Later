import { SupabaseAuthService, parseOAuthRedirect, resolveOAuthRedirectUri } from '@/features/auth/SupabaseAuthService';
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
    const migrationService = migration();
    await expect(new SupabaseAuthService(client, migrationService).createAccount('viewer@example.test', 'test-password'))
      .resolves.toMatchObject({ mode: 'authenticated', userId: user.id });
    expect(migrationService.migrateToAccount).toHaveBeenCalledWith(user.id);
  });

  it('keeps a guest session when email confirmation is required', async () => {
    const client = authClient();
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
