import { useEffect } from 'react';
import { router } from 'expo-router';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/feedback/FeedbackViews';

/**
 * Landing route for Clerk's browser SSO redirect (`sso-callback` path). The
 * pending `startSSOFlow` session completes the sign-in and navigates away;
 * this screen only avoids an "unmatched route" flash while it settles. If no
 * flow is pending, fall back instead of stranding the user here.
 */
export default function SsoCallbackScreen() {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }, 8000);
    return () => clearTimeout(timer);
  }, []);
  return <Screen><LoadingView label="Finishing sign-in" /></Screen>;
}
