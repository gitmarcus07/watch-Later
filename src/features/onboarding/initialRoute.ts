import type { SessionState } from '@/domain/models/session';

export function getInitialRoute(session: SessionState, onboardingComplete: boolean): '/(tabs)' | '/(onboarding)/welcome' {
  return session.mode !== 'unauthenticated' || onboardingComplete ? '/(tabs)' : '/(onboarding)/welcome';
}
