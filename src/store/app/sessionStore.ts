import { create } from 'zustand';
import type { SessionState } from '@/domain/models/session';

interface SessionStore {
  session: SessionState;
  onboardingComplete: boolean;
  hasHydrated: boolean;
  setSession: (session: SessionState) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setHasHydrated: (hydrated: boolean) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: { mode: 'unauthenticated' },
  onboardingComplete: false,
  hasHydrated: false,
  setSession: (session) => set({ session }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
}));
