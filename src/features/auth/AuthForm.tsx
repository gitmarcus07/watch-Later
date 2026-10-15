import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { AppButton } from '@/components/buttons/AppButton';
import { IconButton } from '@/components/buttons/IconButton';
import { Screen } from '@/components/common/Screen';
import { AuthGradientBackground } from '@/components/auth/AuthGradientBackground';
import { showDialog } from '@/components/feedback/AppDialog';
import { DeviceLinkedError, NO_GOOGLE_ACCOUNT_MESSAGE, NO_GOOGLE_ACCOUNT_TITLE, SupabaseAuthService, isDeviceLinkedError } from './SupabaseAuthService';
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
  const isSignUp = mode === 'sign-up';

  async function finishAuth(session: SessionState) {
    await persistSession(session, true);
    setSession(session); setOnboardingComplete(true);
    // A fresh session starts from a clean sync slate — a previous account's
    // "needs attention"/"offline" status must not bleed into this one.
    useSyncStore.getState().reset();
    if (session.mode === 'authenticated') scheduleAutoSync('auth');
    router.replace('/(tabs)');
    // An existing email that resolved to a sign-in (instead of a new account)
    // gets an unmissable confirmation so it never reads as "creating account".
    if (session.mode === 'authenticated' && session.notice) {
      void showDialog({ type: 'info', title: 'You already have an account', message: session.notice, primaryAction: { label: 'Continue' } });
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
          setError(retryCause instanceof Error ? retryCause.message : 'Unable to connect to your account. Try again.');
          return;
        }
      } else if (isDeviceLinkedError(cause)) {
        try {
          if (await offerLinkedResetAndRetry(attempt)) return;
        } catch (retryCause) {
          setError(retryCause instanceof Error ? retryCause.message : 'Unable to connect to your account. Try again.');
          return;
        }
      }
      setError(cause instanceof Error ? cause.message : 'Unable to connect to your account. Try again.');
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
    void showDialog({ type: 'error', title: 'Google sign-in failed', message });
  }

  async function continueWithGoogle() {
    if (googleLoading || loading) return;
    setGoogleLoading(true); setError('');
    const attempt = async () => {
      const session = await authService.signInWithGoogle(isSignUp ? 'sign-up' : 'sign-in');
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
