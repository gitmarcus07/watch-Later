import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/common/Screen';
import { LoadingView } from '@/components/feedback/FeedbackViews';
import { showDialogUnlessQueued } from '@/components/feedback/AppDialog';
import { showFriendlyError } from '@/lib/friendlyError';
import { LOCAL_LIBRARY_PREP_TITLE } from '@/lib/localLibraryNotice';
import { DeviceLinkedError, EXISTING_ACCOUNT_NOTICE, NO_GOOGLE_ACCOUNT_MESSAGE, SupabaseAuthService, consumePendingGoogleMode } from '@/features/auth/SupabaseAuthService';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { useSyncStore } from '@/store/app/syncStore';
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
        // Parity with AuthForm.finishAuth: a new sign-in starts from a clean
        // sync slate — the previous account's pending/error status must not
        // decorate this one on the Android router path.
        useSyncStore.getState().reset();
        if (session.mode === 'authenticated') scheduleAutoSync('auth');
        router.replace('/(tabs)');
        // Google "create account" that resolved to an existing account
        // (Android router path) — the sign-in screen may never render here, so
        // the notice is surfaced from this landing route instead.
        if (session.mode === 'authenticated' && session.notice) {
          const isExistingAccount = session.notice.includes(EXISTING_ACCOUNT_NOTICE);
          // Same title + copy as the auth screen's notice dialog, so the
          // queue collapses any overlap into ONE prompt.
          void showDialogUnlessQueued({
            type: isExistingAccount ? 'info' : 'warning',
            title: isExistingAccount ? 'You already have an account' : LOCAL_LIBRARY_PREP_TITLE,
            message: session.notice,
            primaryAction: { label: 'Continue' },
          });
        }
      } catch (cause) {
        // "No account" and device-link outcomes are owned by the sign-in
        // screen (inline error + actions), which is already waiting on this
        // same flow — a second prompt here would double-surface them. Every
        // other failure gets a dialog (not a toast) before returning to retry.
        const silent = cause instanceof DeviceLinkedError
          || (cause instanceof Error && cause.message === NO_GOOGLE_ACCOUNT_MESSAGE);
        if (!silent) await showFriendlyError(cause, 'Google sign-in failed');
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }
    })();
  }, [params]);

  return <Screen><LoadingView label={label} /></Screen>;
}
