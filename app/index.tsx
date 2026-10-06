import { Redirect } from 'expo-router';
import { useSessionStore } from '@/store/app/sessionStore';
import { getInitialRoute } from '@/features/onboarding/initialRoute';

export default function IndexRoute() {
  const { session, onboardingComplete } = useSessionStore();
  return <Redirect href={getInitialRoute(session, onboardingComplete)} />;
}
