import { AppError } from '@/domain/errors/AppError';
import type { SessionState } from '@/domain/models/session';
import { supabase } from '@/data/remote/supabase/client';
import { SqliteGuestMigrationService } from '@/data/local/repositories/SqliteGuestMigrationService';
import type { GuestMigrationService } from '@/data/local/repositories/GuestMigrationService';
import type { AuthService } from './sessionService';

interface AuthUser { id: string; email?: string }
interface AuthSession { user: AuthUser }
interface AuthFailure { code?: string; message?: string }
interface AuthClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<{ data: { user: AuthUser | null; session: AuthSession | null }; error: AuthFailure | null }>;
    signUp(input: { email: string; password: string }): Promise<{ data: { user: AuthUser | null; session: AuthSession | null }; error: AuthFailure | null }>;
    signOut(): Promise<{ error: AuthFailure | null }>;
  };
}

function friendlyAuthError(error: AuthFailure | null, mode: 'sign-in' | 'sign-up'): AppError {
  const code = error?.code ?? '';
  if (code.includes('invalid_credentials') || error?.message?.toLowerCase().includes('invalid login')) return new AppError('authentication', 'Email or password is incorrect.');
  if (code.includes('already_registered') || error?.message?.toLowerCase().includes('already registered')) return new AppError('authentication', 'An account with this email already exists. Try signing in.');
  if (code.includes('weak_password') || error?.message?.toLowerCase().includes('password')) return new AppError('authentication', 'Choose a stronger password and try again.');
  if (error?.message?.toLowerCase().includes('network')) return new AppError('network', 'Could not reach the account service. Check your connection.');
  return new AppError('authentication', mode === 'sign-in' ? 'Unable to sign in. Please try again.' : 'Unable to create your account. Please try again.');
}

const guestMigrationService = new SqliteGuestMigrationService();

export class SupabaseAuthService implements AuthService {
  constructor(private readonly authClient: AuthClient | null = supabase, private readonly migration: GuestMigrationService = guestMigrationService) {}

  private requireClient(): AuthClient {
    if (!this.authClient) throw new AppError('configuration', 'Configure Supabase to use account features.');
    return this.authClient;
  }

  private async connectAccount(accountId: string): Promise<void> {
    try { await this.migration.migrateToAccount(accountId); }
    catch (error) { await this.requireClient().auth.signOut(); throw error; }
  }

  async continueAsGuest(): Promise<SessionState> {
    return { mode: 'guest', userId: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  }

  async signIn(email: string, password: string): Promise<SessionState> {
    const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) throw friendlyAuthError(error, 'sign-in');
    await this.connectAccount(data.user.id);
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
  }

  async createAccount(email: string, password: string): Promise<SessionState> {
    const { data, error } = await this.requireClient().auth.signUp({ email, password });
    if (error || !data.user) throw friendlyAuthError(error, 'sign-up');
    if (!data.session) throw new AppError('authentication', 'Check your email to confirm your account, then sign in. Your local library is unchanged.');
    await this.connectAccount(data.user.id);
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
  }

  async signOut(): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw new AppError('authentication', 'Unable to log out.', { cause: error });
  }
}
