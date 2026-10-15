import type { SessionState } from '@/domain/models/session';

export interface AuthService {
  continueAsGuest(): Promise<SessionState>;
  signIn(email: string, password: string): Promise<SessionState>;
  createAccount(email: string, password: string): Promise<SessionState>;
  signInWithGoogle(mode?: 'sign-in' | 'sign-up'): Promise<SessionState>;
  signOut(): Promise<void>;
}
