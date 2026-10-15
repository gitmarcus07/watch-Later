import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/feedback/FeedbackViews';
import { showToast } from '@/components/feedback/AppDialog';
import { DeviceLinkedError, NO_GOOGLE_ACCOUNT_MESSAGE, SupabaseAuthService, consumePendingGoogleMode } from '@/features/auth/SupabaseAuthService';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { scheduleAutoSync } from '@/features/sync/autoSync';

const authService = new SupabaseAuthService();

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * OAuth landing route, and on Android the actual sign-in completion path.
 *
 * `watchlater://auth/callback?code=…` matches this route, so Expo Router
 * resolves the deep link before `WebBrowser.openAuthSessionAsync` ever sees the
 * intent — MainActivity is `singleTask`, so the redirect lands on the router
 * rather than on the pending browser session. Exchanging the PKCE code here is
 * therefore what signs the user in; `openAuthSessionAsync` only opens the
 * browser (and still completes the flow itself in Expo Go, where the exp://
 * redirect is intercepted first).
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string; access_token?: string; refresh_token?: string }>();
  const started = useRef(false);
  // Honest interstitial: this screen only verifies the Google return — it is
  // not the app. Sign-in checks whether an account exists; sign-up creates
  // one. The label is set as soon as the stored intent is read.
  const [label, setLabel] = useState('Checking your account…');

  useEffect(() => {
    // Deep links can deliver params across re-renders; run exactly once.
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const mode = await consumePendingGoogleMode();
        setLabel(mode === 'sign-up' ? 'Creating your account…' : 'Checking your account…');
        const session = await authService.completeGoogleCallback({
          code: one(params.code),
          error: one(params.error),
          errorDescription: one(params.error_description),
          accessToken: one(params.access_token),
          refreshToken: one(params.refresh_token),
        }, mode);
        await persistSession(session, true);
        useSessionStore.getState().setSession(session);
        useSessionStore.getState().setOnboardingComplete(true);
        if (session.mode === 'authenticated') scheduleAutoSync('auth');
        router.replace('/(tabs)');
      } catch (cause) {
        // "No account" and device-link outcomes are owned by the sign-in
        // screen (inline error + actions), which is already waiting on this
        // same flow — toasting here would double-surface them. Other failures
        // still toast before returning to retry.
        const silent = cause instanceof DeviceLinkedError
          || (cause instanceof Error && cause.message === NO_GOOGLE_ACCOUNT_MESSAGE);
        if (!silent) showToast(cause instanceof Error ? cause.message : 'Google sign-in failed. Please try again.', 'error');
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }
    })();
  }, [params]);

  return <Screen><LoadingView label={label} /></Screen>;
}
