import { useEffect } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/feedback/FeedbackViews';

/**
 * OAuth landing route. The browser session normally intercepts the callback
 * before the router ever sees it, but if the URL does reach the router
 * (dev-session redirects), this guards against an unmatched-route screen:
 * sign-in completes in the auth screens, so anything arriving here just goes
 * home.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    router.replace('/(tabs)');
  }, []);
  return <Screen><LoadingView label="Finishing sign-in" /></Screen>;
}
