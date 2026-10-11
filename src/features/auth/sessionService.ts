import type { SessionState } from '@/domain/models/session';

export interface AuthService {
  continueAsGuest(): Promise<SessionState>;
  signIn(email: string, password: string): Promise<SessionState>;
  createAccount(email: string, password: string): Promise<SessionState>;
  signInWithGoogle(): Promise<SessionState>;
  signOut(): Promise<void>;
}
