import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { AppButton } from '@/components/buttons/AppButton';
import { IconButton } from '@/components/buttons/IconButton';
import { Screen } from '@/components/common/Screen';
import { SupabaseAuthService } from './SupabaseAuthService';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { colors, radius, spacing } from '@/theme';

const authService = new SupabaseAuthService();
type Mode = 'sign-in' | 'sign-up';

export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setSession = useSessionStore((store) => store.setSession);
  const setOnboardingComplete = useSessionStore((store) => store.setOnboardingComplete);
  const isSignUp = mode === 'sign-up';

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    if (isSignUp && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const session = isSignUp ? await authService.createAccount(normalizedEmail, password) : await authService.signIn(normalizedEmail, password);
      await persistSession(session, true);
      setSession(session); setOnboardingComplete(true);
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect to your account. Try again.');
    } finally { setLoading(false); }
  }

  async function continueAsGuest() {
    try {
      const session = await authService.continueAsGuest();
      await persistSession(session, true); setSession(session); setOnboardingComplete(true);
      router.replace('/(tabs)');
    } catch { Alert.alert('Guest mode unavailable', 'Your local library is safe. Please try again.'); }
  }

  return <Screen scroll><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
    <View style={styles.header}><IconButton name="close" label="Close" onPress={() => router.back()} /></View>
    <View style={styles.content}>
      <View style={styles.icon}><Ionicons name={isSignUp ? 'person-add-outline' : 'person-outline'} size={26} color={colors.accent} /></View>
      <AppText variant="heading1">{isSignUp ? 'Make it yours' : 'Welcome back'}</AppText>
      <AppText muted style={styles.description}>{isSignUp ? 'Create an account to sync your collection. Your local library will be merged safely.' : 'Sign in to sync your collection across devices.'}</AppText>
      <View style={styles.fields}>
        <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={colors.textMuted} style={styles.input} returnKeyType="next" />
        <TextInput accessibilityLabel="Password" autoCapitalize="none" autoComplete={isSignUp ? 'new-password' : 'password'} textContentType={isSignUp ? 'newPassword' : 'password'} secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textMuted} style={styles.input} returnKeyType={isSignUp ? 'next' : 'done'} onSubmitEditing={() => { if (!isSignUp) void submit(); }} />
        {isSignUp ? <TextInput accessibilityLabel="Confirm password" autoCapitalize="none" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" placeholderTextColor={colors.textMuted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void submit()} /> : null}
      </View>
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
      <AppButton label={isSignUp ? 'Create account' : 'Sign in'} onPress={() => void submit()} loading={loading} disabled={loading} />
      <Pressable accessibilityRole="button" onPress={() => router.replace(isSignUp ? '/(auth)/login' : '/(auth)/create-account')} style={styles.switch}><AppText variant="bodySmall" muted>{isSignUp ? 'Already have an account? ' : 'New to Watch Later? '}<AppText variant="bodySmall" style={styles.link}>{isSignUp ? 'Sign in' : 'Create account'}</AppText></AppText></Pressable>
      <Pressable accessibilityRole="button" onPress={() => void continueAsGuest()} style={styles.guest}><AppText variant="bodySmall" style={styles.link}>Continue as Guest</AppText></Pressable>
    </View>
  </KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, header: { paddingTop: spacing.md, alignItems: 'flex-start' }, content: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingBottom: spacing['2xl'] }, icon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm }, description: { lineHeight: 22 }, fields: { gap: spacing.md, marginTop: spacing.md }, input: { minHeight: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: spacing.lg, fontSize: 16 }, switch: { alignItems: 'center', paddingVertical: spacing.sm }, guest: { alignItems: 'center', padding: spacing.md }, link: { color: colors.accent }, error: { color: colors.error } });
