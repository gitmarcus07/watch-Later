import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
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
