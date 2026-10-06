import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionState } from '@/domain/models/session';
import { useSessionStore } from './sessionStore';
import { supabase } from '@/data/remote/supabase/client';

const KEY = 'watch-later.session.v1';
interface PersistedSession {
  session: SessionState;
  onboardingComplete: boolean;
}

export async function hydrateSession(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) as PersistedSession : undefined;
    if (saved?.session && typeof saved.onboardingComplete === 'boolean') {
      useSessionStore.getState().setSession(saved.session);
      useSessionStore.getState().setOnboardingComplete(saved.onboardingComplete);
    }
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const authenticated = { mode: 'authenticated' as const, userId: data.session.user.id, email: data.session.user.email ?? '' };
        useSessionStore.getState().setSession(authenticated);
        if (saved) await persistSession(authenticated, saved.onboardingComplete);
      } else if (saved?.session.mode === 'authenticated') {
        const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
        useSessionStore.getState().setSession(guest);
        await persistSession(guest, saved.onboardingComplete);
      }
    } else if (saved?.session.mode === 'authenticated') {
      const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
      useSessionStore.getState().setSession(guest);
      await persistSession(guest, saved.onboardingComplete);
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
