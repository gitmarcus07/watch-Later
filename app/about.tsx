import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { colors, radius, spacing } from '@/theme';

const version = Constants.expoConfig?.version ?? '1.0.0';
const logo = require('../assets/logo.png');

const highlights: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  { icon: 'bookmark-outline', title: 'Track anything', detail: 'Movies, TV series and anime in one library.' },
  { icon: 'checkmark-done-outline', title: 'Episode-level progress', detail: 'Pick up exactly where you stopped, season by season.' },
  { icon: 'cloud-outline', title: 'Optional cloud sync', detail: 'Sign in and your library follows you across devices.' },
];

const acknowledgements: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'film-outline', text: 'Movie and TV metadata is provided by TMDb. This product uses the TMDb API but is not endorsed or certified by TMDb.' },
  { icon: 'tv-outline', text: 'Some movie and series details, including age ratings and credits, are provided by TheTVDB.com. This product uses TheTVDB.com data but is not endorsed or certified by TheTVDB.com.' },
  { icon: 'sparkles-outline', text: 'Anime metadata is provided by AniList.' },
  { icon: 'ban-outline', text: 'Watch Later does not provide or host any streaming content.' },
];

export default function AboutScreen() {
  const router = useRouter();
  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">About</AppText></View>

    <View style={styles.hero}>
      <View style={styles.logoGlow}><View style={styles.logoRing}><Image source={logo} style={styles.logo} resizeMode="cover" /></View></View>
      <AppText variant="heading1" style={styles.brand}>Watch Later</AppText>
      <View style={styles.versionPill}><Ionicons name="pricetag-outline" size={11} color={colors.accent} /><AppText variant="caption" style={styles.versionText}>VERSION {version}</AppText></View>
      <AppText muted style={styles.tagline}>
        A personal tracker for movies, TV series and anime. Save what you want to watch, track what you finish, and pick up right where you left off — on this device, with optional cloud sync when you sign in.
      </AppText>
    </View>

    <View style={styles.card}>
      <AppText variant="caption" style={styles.cardTitle}>WHAT IT DOES</AppText>
      {highlights.map((item) => (
        <View key={item.title} style={styles.highlight}>
          <View style={styles.highlightIcon}><Ionicons name={item.icon} size={18} color={colors.accent} /></View>
          <View style={styles.highlightCopy}>
            <AppText variant="bodyMedium">{item.title}</AppText>
            <AppText variant="bodySmall" muted>{item.detail}</AppText>
          </View>
        </View>
      ))}
    </View>

    <View style={styles.card}>
      <AppText variant="caption" style={styles.cardTitle}>ACKNOWLEDGEMENTS</AppText>
      {acknowledgements.map((item) => (
        <View key={item.text} style={styles.ack}>
          <Ionicons name={item.icon} size={15} color={colors.textMuted} style={styles.ackIcon} />
          <AppText variant="bodySmall" muted style={styles.ackText}>{item.text}</AppText>
        </View>
      ))}
    </View>

    <View style={styles.footer}>
      <View style={styles.footerMark}><Ionicons name="bookmark" size={12} color={colors.background} /></View>
      <AppText variant="caption" muted>WATCH LATER · MADE FOR YOUR QUEUE</AppText>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, marginBottom: spacing.xl },
  logoGlow: { padding: spacing.lg, borderRadius: 999, backgroundColor: 'rgba(168, 85, 247, 0.12)', marginBottom: spacing.sm },
  logoRing: { width: 104, height: 104, borderRadius: 52, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(168, 85, 247, 0.45)', backgroundColor: colors.background },
  logo: { width: 104, height: 104 },
  brand: { letterSpacing: -0.8 },
  versionPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  versionText: { color: colors.textSecondary, letterSpacing: 1 },
  tagline: { textAlign: 'center', lineHeight: 22, marginTop: spacing.xs },
  card: { gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  cardTitle: { color: colors.accent, letterSpacing: 1.6 },
  highlight: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  highlightIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  highlightCopy: { flex: 1, gap: 2 },
  ack: { flexDirection: 'row', gap: spacing.sm },
  ackIcon: { marginTop: 3 },
  ackText: { flex: 1, lineHeight: 21 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  footerMark: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
});
