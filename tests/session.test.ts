import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInitialRoute } from '@/features/onboarding/initialRoute';
import { hydrateSession, persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';

describe('guest session', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useSessionStore.setState({ session: { mode: 'unauthenticated' }, onboardingComplete: false, hasHydrated: false });
  });

  it('opens the welcome screen until onboarding is complete', () => {
    expect(getInitialRoute({ mode: 'unauthenticated' }, false)).toBe('/(onboarding)/welcome');
    expect(getInitialRoute({ mode: 'guest', userId: 'local-user' }, true)).toBe('/(tabs)');
  });

  it('persists guest mode across session hydration', async () => {
    const guest = { mode: 'guest' as const, userId: 'guest-local-1' };
    await persistSession(guest, true);
    await hydrateSession();
    expect(useSessionStore.getState().session).toEqual(guest);
    expect(useSessionStore.getState().onboardingComplete).toBe(true);
    expect(getInitialRoute(useSessionStore.getState().session, true)).toBe('/(tabs)');
  });
});
