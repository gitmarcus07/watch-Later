import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useClerk, useSSO } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { AppButton } from '@/components/buttons/AppButton';
import { IconButton } from '@/components/buttons/IconButton';
import { Screen } from '@/components/common/Screen';
import { AuthGradientBackground } from '@/components/auth/AuthGradientBackground';
import { showDialog, showDialogUnlessQueued } from '@/components/feedback/AppDialog';
import { showFriendlyError } from '@/lib/friendlyError';
import { DeviceLinkedError, EXISTING_ACCOUNT_NOTICE, NO_GOOGLE_ACCOUNT_MESSAGE, NO_GOOGLE_ACCOUNT_TITLE, SupabaseAuthService, isDeviceLinkedError } from './SupabaseAuthService';
import { AppError } from '@/domain/errors/AppError';
import { LOCAL_LIBRARY_PREP_TITLE } from '@/lib/localLibraryNotice';
import type { SessionState } from '@/domain/models/session';
import { scheduleAutoSync } from '@/features/sync/autoSync';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { useSyncStore } from '@/store/app/syncStore';
import { colors, radius, spacing } from '@/theme';

const authService = new SupabaseAuthService();
type Mode = 'sign-in' | 'sign-up';

/** Shown only when switching accounts would destroy genuinely unsynced local changes. */
const ACCOUNT_SWITCH_TITLE = 'Switch to a different account?';
const ACCOUNT_SWITCH_MESSAGE = 'This device still has changes that haven’t been uploaded from the account you were using. To sign in here, we’ll clear this device’s saved list and load this account’s library instead. Anything already synced stays safe in the other account.';

function GlowOrb() {
  const glow = useSharedValue(0.5);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View pointerEvents="none" style={[styles.orb, style]} />;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const setSession = useSessionStore((store) => store.setSession);
  const setOnboardingComplete = useSessionStore((store) => store.setOnboardingComplete);
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const isSignUp = mode === 'sign-up';

  async function finishAuth(session: SessionState) {
    await persistSession(session, true);
    setSession(session); setOnboardingComplete(true);
    // A fresh session starts from a clean sync slate — a previous account's
    // "needs attention"/"offline" status must not bleed into this one.
    useSyncStore.getState().reset();
    if (session.mode === 'authenticated') scheduleAutoSync('auth');
    router.replace('/(tabs)');
    // A notice (existing account resolved as sign-in, or a local-library
    // prep hiccup) always gets an unmissable prompt, never silence.
    if (session.mode === 'authenticated' && session.notice) {
      const isExistingAccount = session.notice.includes(EXISTING_ACCOUNT_NOTICE);
      // Non-existing-account notices are the local-library prep notice — use
      // the shared title so a duplicate prompt elsewhere is deduped.
      void showDialogUnlessQueued({
        type: isExistingAccount ? 'info' : 'warning',
        title: isExistingAccount ? 'You already have an account' : LOCAL_LIBRARY_PREP_TITLE,
        message: session.notice,
        primaryAction: { label: 'Continue' },
      });
    }
  }

  /**
   * Device-link recovery without a second browser trip: the Supabase session
   * from the just-completed sign-in is still alive, so confirming only wipes
   * the stale device library and binds that SAME account. Returns true when
   * the retry finished auth (caller should return early).
   */
  async function offerLinkedResetAndContinue(pending: DeviceLinkedError): Promise<boolean> {
    const confirmed = await showDialog({
      type: 'warning',
      title: ACCOUNT_SWITCH_TITLE,
      message: ACCOUNT_SWITCH_MESSAGE,
      primaryAction: { label: 'Clear & switch', destructive: true },
      secondaryAction: { label: 'Cancel' },
    });
    if (!confirmed) {
      await authService.dismissDeviceLinkRepair();
      return false;
    }
    const session = await authService.resolveDeviceLinkAndBind(pending);
    await finishAuth(session);
    return true;
  }

  /** Legacy fallback for link errors without a live session: re-run the attempt. */
  async function offerLinkedResetAndRetry(retry: () => Promise<void>): Promise<boolean> {
    const confirmed = await showDialog({
      type: 'warning',
      title: ACCOUNT_SWITCH_TITLE,
      message: ACCOUNT_SWITCH_MESSAGE,
      primaryAction: { label: 'Clear & switch', destructive: true },
      secondaryAction: { label: 'Cancel' },
    });
    if (!confirmed) return false;
    await retry();
    return true;
  }

  async function submit() {
    // Re-entrancy guard: the keyboard's "done" (onSubmitEditing) calls submit
    // directly and bypasses the disabled button — without this a double-fire
    // starts a second signIn/signUp while the first is still in flight, and
    // the first `finally` re-enables the button mid-attempt.
    if (loading || googleLoading) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    if (isSignUp && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const attempt = async () => {
      const session = isSignUp ? await authService.createAccount(normalizedEmail, password) : await authService.signIn(normalizedEmail, password);
      await finishAuth(session);
    };
    try {
      await attempt();
    } catch (cause) {
      if (cause instanceof DeviceLinkedError) {
        try {
          if (await offerLinkedResetAndContinue(cause)) return;
        } catch (retryCause) {
          await showFriendlyError(retryCause, 'Couldn’t connect to your account');
          return;
        }
      } else if (isDeviceLinkedError(cause)) {
        try {
          if (await offerLinkedResetAndRetry(attempt)) return;
        } catch (retryCause) {
          await showFriendlyError(retryCause, 'Couldn’t connect to your account');
          return;
        }
      }
      // Every auth failure is a prompt, never just red text under the form:
      // AppError copy like "Couldn't prepare this account's local library."
      // is shown verbatim; unknown errors get the sanitized fallback.
      await showFriendlyError(cause, isSignUp ? 'Couldn’t create your account' : 'Couldn’t sign in');
    } finally { setLoading(false); }
  }

  async function continueAsGuest() {
    try {
      const session = await authService.continueAsGuest();
      await persistSession(session, true); setSession(session); setOnboardingComplete(true);
      router.replace('/(tabs)');
    } catch { void showDialog({ type: 'error', title: 'Guest mode unavailable', message: 'Your local library is safe. Please try again.' }); }
  }

  /**
   * Google failures surface as prompts, never as a bottom toast or a line of
   * red text: "no account found" offers to create one on the spot, everything
   * else explains itself in a dialog. Cancelling stays silent.
   */
  async function reportGoogleFailure(cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Google sign-in failed. Please try again.';
    if (message === 'Google sign-in was cancelled.') return;
    if (message === NO_GOOGLE_ACCOUNT_MESSAGE) {
      const create = await showDialog({
        type: 'warning',
        title: NO_GOOGLE_ACCOUNT_TITLE,
        message: NO_GOOGLE_ACCOUNT_MESSAGE,
        primaryAction: { label: 'Create account' },
        secondaryAction: { label: 'Cancel' },
      });
      if (create) router.replace('/(auth)/create-account');
      return;
    }
    // AppError copy (provider decline, exchange failure) is shown verbatim;
    // unknown errors are sanitised by the helper. Never a raw diagnostic.
    await showFriendlyError(cause, 'Google sign-in failed');
  }

  async function continueWithGoogle() {
    if (googleLoading || loading) return;
    setGoogleLoading(true); setError('');
    // Google now signs in through Clerk (`useSSO` browser flow, works in Expo
    // Go): the Clerk session authorizes Supabase through third-party auth, so
    // no Supabase Auth session is created. Email/password below is untouched.
    const attempt = async () => {
      // Self-heal phones carrying a stale Clerk session (signed out of the
      // app before app sign-out ended both sessions): Clerk rejects a new SSO
      // flow while signed in, so drop it first. The login screen never holds
      // a live app session worth keeping.
      if (clerk.session) await clerk.signOut().catch(() => undefined);
      const { createdSessionId, setActive, signUp } = await startSSOFlow({ strategy: 'oauth_google' });
      if (!createdSessionId) {
        if (signUp?.status === 'missing_requirements') {
          throw new AppError('authentication', 'Google didn’t share everything needed. Add the missing details and try again.');
        }
        throw new AppError('authentication', 'Google sign-in was cancelled.');
      }
      await setActive!({ session: createdSessionId });
      const clerkUser = await readActiveClerkUser();
      const email = clerkUser.primaryEmailAddress?.emailAddress
        ?? clerkUser.emailAddresses[0]?.emailAddress
        ?? '';
      if (!email) throw new AppError('authentication', 'Google sign-in did not return an account. Please try again.');
      const session = await authService.signInWithClerk({
        userId: clerkUser.id,
        email,
        createdAtMs: clerkUser.createdAt?.getTime() ?? null,
        googleMode: isSignUp ? 'sign-up' : 'sign-in',
        clerkSignOut: () => clerk.signOut(),
      });
      await finishAuth(session);
    };
    try {
      await attempt();
    } catch (cause) {
      if (cause instanceof DeviceLinkedError) {
        try {
          if (await offerLinkedResetAndContinue(cause)) return;
        } catch (retryCause) {
          await reportGoogleFailure(retryCause);
          return;
        }
        // Declined: leave no half-signed-in Clerk session behind.
        await clerk.signOut().catch(() => undefined);
      } else if (isDeviceLinkedError(cause)) {
        try {
          if (await offerLinkedResetAndRetry(attempt)) return;
        } catch (retryCause) {
          await reportGoogleFailure(retryCause);
          return;
        }
      }
      await reportGoogleFailure(cause);
    } finally { setGoogleLoading(false); }
  }

  /**
   * The Clerk user right after `setActive` resolves. Polls briefly: state
   * propagation can lag a frame behind activation.
   */
  async function readActiveClerkUser() {
    for (let i = 0; i < 20; i += 1) {
      const current = clerk.user;
      if (current?.id) return current;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new AppError('authentication', 'Google sign-in did not complete. Please try again.');
  }

  const fieldStyle = (key: string) => [styles.input, focused === key && styles.inputFocused];

  return <Screen scroll><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
    <AuthGradientBackground />
    <Animated.View entering={FadeInDown.duration(450)} style={styles.header}>
      <IconButton name="close" label="Close" onPress={() => router.back()} />
      <View style={styles.headerBadge}><Ionicons name="bookmark" size={12} color={colors.background} /><AppText variant="caption" style={styles.headerBadgeText}>WATCH LATER</AppText></View>
    </Animated.View>
    <Animated.View entering={FadeInDown.delay(90).duration(550)} style={styles.hero}>
      <GlowOrb />
      <AppText variant="caption" style={styles.eyebrow}>{isSignUp ? 'JOIN WATCH LATER' : 'WELCOME BACK'}</AppText>
      <AppText variant="display" style={styles.title}>{isSignUp ? 'Make it yours' : 'Welcome back'}</AppText>
      <View style={styles.accentBar} />
      <AppText muted style={styles.description}>{isSignUp ? 'Create an account to sync your collection. Your local library will be merged safely.' : 'Sign in to sync your collection across devices.'}</AppText>
    </Animated.View>
    <Animated.View entering={FadeInDown.delay(170).duration(550)} style={styles.googleBlock}>
      <Pressable accessibilityRole="button" accessibilityLabel={isSignUp ? 'Sign up with Google' : 'Sign in with Google'} accessibilityHint={isSignUp ? 'Creates a new account with your Google email.' : 'Signs in with your existing Google account.'} accessibilityState={{ disabled: loading || googleLoading, busy: googleLoading }} disabled={loading || googleLoading} onPress={() => void continueWithGoogle()} style={({ pressed }) => [styles.google, pressed && !(loading || googleLoading) && styles.googlePressed]}>
        {googleLoading ? <ActivityIndicator color="#1A1A1A" /> : <Ionicons name="logo-google" size={19} color="#1A1A1A" />}
        <AppText variant="button" style={styles.googleLabel}>{isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</AppText>
      </Pressable>
      <View style={styles.recommended}><Ionicons name="flash" size={11} color={colors.accent} /><AppText variant="caption" muted>Fastest — no password, no verification email</AppText></View>
    </Animated.View>

    <View style={styles.divider}><View style={styles.dividerLine} /><AppText variant="caption" muted>or continue with email</AppText><View style={styles.dividerLine} /></View>

    <View style={styles.fields}>
      <Animated.View entering={FadeInDown.delay(360).duration(550)}>
        <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} placeholder="Email address" placeholderTextColor={colors.textMuted} style={fieldStyle('email')} returnKeyType="next" selectionColor={colors.accent} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(430).duration(550)}>
        <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete={isSignUp ? 'new-password' : 'password'} textContentType={isSignUp ? 'newPassword' : 'password'} secureTextEntry value={password} onChangeText={setPassword} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} placeholder="Password" placeholderTextColor={colors.textMuted} style={fieldStyle('password')} returnKeyType={isSignUp ? 'next' : 'done'} onSubmitEditing={() => { if (!isSignUp) void submit(); }} selectionColor={colors.accent} />
      </Animated.View>
      {isSignUp ? (
        <Animated.View entering={FadeInDown.delay(500).duration(550)}>
          <TextInput accessibilityLabel="Confirm password" autoCapitalize="none" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} onFocus={() => setFocused('confirm')} onBlur={() => setFocused(null)} placeholder="Confirm password" placeholderTextColor={colors.textMuted} style={fieldStyle('confirm')} returnKeyType="done" onSubmitEditing={() => void submit()} selectionColor={colors.accent} />
        </Animated.View>
      ) : null}
    </View>
    {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    <Animated.View entering={FadeInDown.delay(560).duration(550)} style={styles.actions}>
      <AppButton label={isSignUp ? 'Create account' : 'Sign in'} onPress={() => void submit()} loading={loading} disabled={loading || googleLoading} variant="secondary" icon={<Ionicons name={isSignUp ? 'person-add-outline' : 'log-in-outline'} size={18} color={colors.textPrimary} />} />
      <Pressable accessibilityRole="button" onPress={() => router.replace(isSignUp ? '/(auth)/login' : '/(auth)/create-account')} style={styles.switch}><AppText variant="bodySmall" muted>{isSignUp ? 'Already have an account? ' : 'New to Watch Later? '}<AppText variant="bodySmall" style={styles.link}>{isSignUp ? 'Sign in' : 'Create account'}</AppText></AppText></Pressable>
      <Pressable accessibilityRole="button" onPress={() => void continueAsGuest()} style={styles.guest}><Ionicons name="arrow-forward" size={15} color={colors.accent} /><AppText variant="bodySmall" style={styles.link}>Continue as Guest</AppText></Pressable>
    </Animated.View>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(15,15,23,0.6)', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  headerBadgeText: { color: '#E9E2F5', fontSize: 10, letterSpacing: 1.6 },
  hero: { paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm },
  orb: { position: 'absolute', top: -40, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(124,58,237,0.09)' },
  eyebrow: { color: colors.accent, letterSpacing: 2.4 },
  title: { color: colors.white, fontSize: 38, lineHeight: 44, letterSpacing: -1 },
  accentBar: { width: 56, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: spacing.xs },
  description: { lineHeight: 22, maxWidth: 320 },
  fields: { gap: spacing.md, marginTop: spacing.sm },
  input: { minHeight: 58, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(22,22,28,0.9)', color: colors.textPrimary, paddingHorizontal: spacing.lg, fontSize: 16 },
  inputFocused: { borderColor: colors.accent, backgroundColor: colors.surfaceElevated },
  error: { color: colors.error, marginTop: spacing.md },
  actions: { gap: spacing.xs, marginTop: spacing.lg, paddingBottom: spacing['2xl'] },
  googleBlock: { gap: spacing.sm, marginTop: spacing.sm },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 60, borderRadius: radius.pill, backgroundColor: '#FFFFFF', paddingHorizontal: spacing.xl },
  googlePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  googleLabel: { color: '#1A1A1A' },
  recommended: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  switch: { alignItems: 'center', paddingVertical: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  guest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md },
  link: { color: colors.accent },
});
