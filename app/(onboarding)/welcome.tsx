import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { PosterBackdrop } from '@/components/onboarding/PosterBackdrop';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { colors, radius, shadows, spacing } from '@/theme';
import { persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';

const authService = new SupabaseAuthService();

const HERO_POSTERS = [
  { uri: 'https://image.tmdb.org/t/p/w342/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', label: 'Dune: Part Two' },
  { uri: 'https://image.tmdb.org/t/p/w342/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg', label: 'Spirited Away' },
  { uri: 'https://image.tmdb.org/t/p/w342/ggFHVNu6YYI5L9pCfOacjizRGt.jpg', label: 'Breaking Bad' },
];

const HIGHLIGHTS = [
  { icon: 'bookmark', label: 'Track it all' },
  { icon: 'notifications-outline', label: 'Never miss out' },
  { icon: 'sync-outline', label: 'Yours everywhere' },
] as const;

function FloatingPoster({ uri, label, rotate, size, delay, duration, distance, enterDelay }: {
  uri: string;
  label: string;
  rotate: string;
  size: { width: number; height: number };
  delay: number;
  duration: number;
  distance: number;
  enterDelay: number;
}) {
  const [failed, setFailed] = useState(false);
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withDelay(
      delay,
      withRepeat(withTiming(-distance, { duration, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [bob, delay, distance, duration]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  return (
    <Animated.View entering={FadeIn.delay(enterDelay).duration(600)} style={[{ transform: [{ rotate }] }]}>
      <Animated.View style={[styles.poster, size, bobStyle]} accessibilityLabel={label}>
        {failed ? (
          <LinearGradient colors={['#3B2A63', '#1B1233']} style={[StyleSheet.absoluteFill, styles.posterFallback]}>
            <Ionicons name="film-outline" size={30} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        ) : (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        )}
        <LinearGradient colors={['transparent', 'rgba(7,3,18,0.55)']} style={styles.posterShade} />
      </Animated.View>
    </Animated.View>
  );
}

function GlowOrb() {
  const glow = useSharedValue(0.55);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View pointerEvents="none" style={[styles.orb, style]} />;
}

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
      <PosterBackdrop rowCount={3} opacity={0.5} />

      <Animated.View entering={FadeInUp.duration(650)} style={styles.hero}>
        <GlowOrb />
        <View style={styles.fan}>
          <FloatingPoster uri={HERO_POSTERS[0].uri} label={HERO_POSTERS[0].label} rotate="-10deg" size={styles.posterSide} delay={200} duration={3400} distance={10} enterDelay={120} />
          <FloatingPoster uri={HERO_POSTERS[1].uri} label={HERO_POSTERS[1].label} rotate="0deg" size={styles.posterCenter} delay={0} duration={3000} distance={12} enterDelay={0} />
          <FloatingPoster uri={HERO_POSTERS[2].uri} label={HERO_POSTERS[2].label} rotate="10deg" size={styles.posterSide} delay={500} duration={3700} distance={9} enterDelay={240} />
        </View>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Ionicons name="bookmark" size={18} color={colors.background} /></View>
          <AppText variant="label" style={styles.brand}>Watch Later</AppText>
        </View>
        <View style={styles.badge}><Ionicons name="sparkles" size={13} color={colors.accent} /><AppText variant="caption" style={styles.badgeText}>MOVIES · SHOWS · ANIME</AppText></View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(700)} style={styles.copy}>
        <AppText variant="display" style={styles.title}>Stories worth{'\n'}<AppText variant="display" style={styles.titleAccent}>remembering.</AppText></AppText>
        <AppText variant="body" muted style={styles.description}>Track what you want to watch and remember everything you’ve watched.</AppText>
        <View style={styles.highlights}>
          {HIGHLIGHTS.map((item) => (
            <View key={item.label} style={styles.highlight}>
              <View style={styles.highlightIcon}><Ionicons name={item.icon} size={16} color={colors.accent} /></View>
              <AppText variant="caption" style={styles.highlightText}>{item.label}</AppText>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(700)} style={styles.actions}>
        <AppButton label="Continue as Guest" onPress={enterGuestMode} loading={loading} icon={<Ionicons name="arrow-forward" size={19} color={colors.background} />} />
        {error ? <AppText accessibilityRole="alert" muted style={styles.error}>{error}</AppText> : null}
        <View style={styles.accountRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={() => router.push('/(auth)/create-account')} style={styles.accountButton}><AppText variant="bodySmall" style={styles.accountText}>Create account</AppText></Pressable>
          <View style={styles.separator} />
          <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={() => router.push('/(auth)/login')} style={styles.accountButton}><AppText variant="bodySmall" style={styles.accountText}>Log in</AppText></Pressable>
        </View>
        <View style={styles.privacy}><Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} /><Pressable accessibilityRole="button" accessibilityLabel="Read our privacy notice" onPress={() => router.push('/privacy')}><AppText variant="caption" muted style={styles.privacyText}>Your collection stays yours</AppText></Pressable></View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, overflow: 'hidden' },
  hero: { height: '46%', minHeight: 300, maxHeight: 420, justifyContent: 'flex-end' },
  orb: { position: 'absolute', top: 24, left: '18%', width: 260, height: 240, borderRadius: 160, backgroundColor: 'rgba(168,85,247,0.16)' },
  fan: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.xl },
  poster: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(236,221,255,0.4)', backgroundColor: '#241A3D', ...shadows.card },
  posterSide: { width: 96, height: 140, marginBottom: 14 },
  posterCenter: { width: 122, height: 178, borderColor: 'rgba(242,229,255,0.55)' },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  posterShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  brandIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  brand: { letterSpacing: 2.4, color: '#E9E2F5', fontSize: 11 },
  badge: { position: 'absolute', top: spacing.xl, right: 0, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', backgroundColor: 'rgba(15,15,23,0.62)', paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, borderColor: 'rgba(255,255,255,0.13)', borderWidth: 1 },
  badgeText: { color: '#F0EAFB', fontSize: 10, letterSpacing: 1.1, fontWeight: '600' },
  copy: { flex: 1, justifyContent: 'center', paddingTop: spacing.md },
  title: { fontSize: 37, lineHeight: 43, letterSpacing: -1.4 },
  titleAccent: { color: colors.accent },
  description: { maxWidth: 310, marginTop: spacing.md, color: '#AAA9B7', lineHeight: 23 },
  highlights: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  highlight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(15,15,23,0.55)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  highlightIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(168,85,247,0.14)', alignItems: 'center', justifyContent: 'center' },
  highlightText: { color: '#E9E2F5', fontSize: 10, flexShrink: 1 },
  actions: { paddingBottom: spacing.md, gap: spacing.sm },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, minHeight: 42 },
  accountButton: { minHeight: 44, minWidth: 120, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  separator: { width: 1, height: 17, backgroundColor: colors.border },
  accountText: { color: '#D2CFDB', fontWeight: '500' },
  privacy: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  privacyText: { color: colors.textMuted, fontSize: 11 },
  error: { color: colors.error, textAlign: 'center' },
});
