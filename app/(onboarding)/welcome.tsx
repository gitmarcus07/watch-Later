import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { colors, radius, shadows, spacing } from '@/theme';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';

const authService = new SupabaseAuthService();

export default function WelcomeScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSession, setOnboardingComplete } = useSessionStore();

  async function enterGuestMode() {
    setLoading(true);
    setError('');
    try {
      const session = await authService.continueAsGuest();
      await persistSession(session, true);
      setSession(session);
      setOnboardingComplete(true);
      router.replace('/(tabs)');
    } catch {
      setError('We couldn’t start guest mode. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.topGlow} />
      <View pointerEvents="none" style={styles.orbGlow} />
      <Animated.View entering={FadeInUp.duration(650)} style={styles.hero}>
        <View style={styles.artFrame}>
          <LinearGradient colors={['#282236', '#171721', colors.background]} locations={[0, 0.58, 1]} style={styles.art}>
            <View style={styles.artLight} />
            <View style={styles.reelA}><Ionicons name="play" size={22} color="rgba(255,255,255,0.6)" /></View>
            <View style={styles.reelB}><Ionicons name="sparkles-outline" size={17} color="rgba(255,255,255,0.48)" /></View>
            <View style={styles.artBadge}><Ionicons name="sparkles" size={13} color={colors.accent} /><AppText variant="caption" style={styles.badgeText}>YOUR NEXT FAVORITE</AppText></View>
            <View style={styles.posterFloat}><Ionicons name="film-outline" size={27} color={colors.white} /><View style={styles.floatLine} /><View style={[styles.floatLine, styles.shortLine]} /></View>
          </LinearGradient>
        </View>
        <View style={styles.brandRow}><View style={styles.brandIcon}><Ionicons name="bookmark" size={18} color={colors.background} /></View><AppText variant="label" style={styles.brand}>Watch Later</AppText></View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(700)} style={styles.copy}>
        <AppText variant="display" style={styles.title}>Stories worth{ '\n' }<AppText variant="display" style={styles.titleAccent}>remembering.</AppText></AppText>
        <AppText variant="body" muted style={styles.description}>Track what you want to watch and remember everything you’ve watched.</AppText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(700)} style={styles.actions}>
        <AppButton label="Continue as Guest" onPress={enterGuestMode} loading={loading} icon={<Ionicons name="arrow-forward" size={19} color={colors.background} />} />
        {error ? <AppText accessibilityRole="alert" muted style={styles.error}>{error}</AppText> : null}
        <View style={styles.accountRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={() => router.push('/(auth)/create-account')} style={styles.accountButton}><AppText variant="bodySmall" style={styles.accountText}>Create account</AppText></Pressable>
          <View style={styles.separator} />
          <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => router.push('/(auth)/login')} style={styles.accountButton}><AppText variant="bodySmall" style={styles.accountText}>Log in</AppText></Pressable>
        </View>
        <View style={styles.privacy}><Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} /><AppText variant="caption" muted style={styles.privacyText}>Your collection stays yours</AppText></View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, overflow: 'hidden' },
  topGlow: { position: 'absolute', top: -190, left: -100, width: 430, height: 430, borderRadius: 215, backgroundColor: 'rgba(133,100,202,0.12)' },
  orbGlow: { position: 'absolute', top: 100, right: -150, width: 290, height: 390, borderRadius: 180, backgroundColor: 'rgba(136,76,139,0.10)', transform: [{ rotate: '32deg' }] },
  hero: { height: '48%', minHeight: 300, maxHeight: 410 },
  artFrame: { position: 'absolute', top: 0, left: -spacing.xl, right: -spacing.xl, height: '100%', overflow: 'hidden' },
  art: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  artLight: { position: 'absolute', top: 30, left: '12%', width: 260, height: 230, borderRadius: 160, backgroundColor: 'rgba(182,156,255,0.11)', transform: [{ rotate: '-25deg' }] },
  reelA: { position: 'absolute', top: 84, left: '24%', width: 112, height: 154, borderRadius: 22, backgroundColor: 'rgba(98,77,131,0.58)', borderColor: 'rgba(236,221,255,0.42)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], ...shadows.card },
  reelB: { position: 'absolute', top: 117, left: '51%', width: 94, height: 130, borderRadius: 19, backgroundColor: 'rgba(115,73,109,0.6)', borderColor: 'rgba(255,224,246,0.38)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '9deg' }], ...shadows.card },
  artBadge: { position: 'absolute', top: spacing.xl, right: spacing.xl, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', backgroundColor: 'rgba(15,15,23,0.58)', paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, borderColor: 'rgba(255,255,255,0.13)', borderWidth: 1 },
  badgeText: { color: '#F0EAFB', fontSize: 10, letterSpacing: 1.1, fontWeight: '600' },
  posterFloat: { position: 'absolute', right: 29, bottom: 76, width: 76, height: 102, borderRadius: 13, backgroundColor: '#343047', borderColor: 'rgba(242,229,255,0.52)', borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }], ...shadows.card },
  floatLine: { width: 37, height: 3, marginTop: 8, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.47)' },
  shortLine: { width: 23, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.24)' },
  brandRow: { position: 'absolute', left: 0, bottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brand: { letterSpacing: 2.4, color: '#E9E2F5', fontSize: 11 },
  copy: { flex: 1, justifyContent: 'center', paddingTop: spacing.md },
  title: { fontSize: 37, lineHeight: 43, letterSpacing: -1.4 },
  titleAccent: { color: colors.accent },
  description: { maxWidth: 310, marginTop: spacing.md, color: '#AAA9B7', lineHeight: 23 },
  actions: { paddingBottom: spacing.md, gap: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, minHeight: 42 },
  accountButton: { minHeight: 44, minWidth: 120, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  separator: { width: 1, height: 17, backgroundColor: colors.border },
  accountText: { color: '#D2CFDB', fontWeight: '500' },
  privacy: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  privacyText: { color: colors.textMuted, fontSize: 11 },
  error: { color: colors.error, textAlign: 'center' },
});
