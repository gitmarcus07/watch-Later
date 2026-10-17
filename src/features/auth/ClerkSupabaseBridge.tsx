import { useEffect } from 'react';
import { useAuth } from '@clerk/expo';
import { setClerkTokenProvider } from '@/data/remote/supabase/client';
import { useSessionStore } from '@/store/app/sessionStore';

/**
 * Feeds Clerk session JWTs (Supabase `supabase`-template) to the Supabase
 * data client for third-party auth. Mounted once inside `ClerkProvider`.
 *
 * Scoped to Clerk app sessions only: if the app is on a Supabase
 * email/password session (or signed out) while a stale Clerk session lingers,
 * the provider stays cleared so sync can never run under the wrong identity.
 * Cleared on sign-out so no Clerk-authed client lingers.
 */
export function ClerkSupabaseBridge() {
  const { getToken, isSignedIn } = useAuth();
  const provider = useSessionStore((state) =>
    state.session.mode === 'authenticated' ? (state.session.provider ?? 'supabase') : null,
  );

  useEffect(() => {
    if (!isSignedIn || provider !== 'clerk') {
      setClerkTokenProvider(null);
      return;
    }
    setClerkTokenProvider(() => getToken({ template: 'supabase' }));
    return () => {
      setClerkTokenProvider(null);
    };
  }, [getToken, isSignedIn, provider]);

  return null;
}
