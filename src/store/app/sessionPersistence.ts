import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionState } from '@/domain/models/session';
import { useSessionStore } from './sessionStore';

const KEY = 'watch-later.session.v1';
interface PersistedSession {
  session: SessionState;
  onboardingComplete: boolean;
}

export async function hydrateSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as PersistedSession;
    if (saved.session && typeof saved.onboardingComplete === 'boolean') {
      useSessionStore.getState().setSession(saved.session);
      useSessionStore.getState().setOnboardingComplete(saved.onboardingComplete);
    }
  } catch {
    await AsyncStorage.removeItem(KEY);
  } finally {
    useSessionStore.getState().setHasHydrated(true);
  }
}

export async function persistSession(session: SessionState, onboardingComplete: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify({ session, onboardingComplete } satisfies PersistedSession));
}
