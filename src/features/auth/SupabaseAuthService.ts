import { AppError } from '@/domain/errors/AppError';
import type { SessionState } from '@/domain/models/session';
import { supabase } from '@/data/remote/supabase/client';
import type { AuthService } from './sessionService';

function requireClient() {
  if (!supabase) throw new AppError('authentication', 'Configure Supabase to use account features.');
  return supabase;
}

export class SupabaseAuthService implements AuthService {
  async continueAsGuest(): Promise<SessionState> {
    return { mode: 'guest', userId: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  }

  async signIn(email: string, password: string): Promise<SessionState> {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AppError('authentication', 'Unable to log in. Check your details.', { cause: error });
    return { mode: 'authenticated', userId: data.user.id };
  }

  async createAccount(email: string, password: string): Promise<SessionState> {
    const { data, error } = await requireClient().auth.signUp({ email, password });
    if (error || !data.user) throw new AppError('authentication', 'Unable to create your account.', { cause: error });
    return { mode: 'authenticated', userId: data.user.id };
  }

  async signOut(): Promise<void> {
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw new AppError('authentication', 'Unable to log out.', { cause: error });
  }
}
