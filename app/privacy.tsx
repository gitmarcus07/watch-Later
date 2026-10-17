import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { colors, radius, spacing } from '@/theme';

const principles = ['No ads', 'Never sold', 'Works offline', 'No accounts'];

const sections: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'phone-portrait-outline', title: 'Your watch data stays yours', body: 'Your watchlist, watched titles, episode progress, favorites, and lists are stored in a database on this device. They work fully offline and are never sold or shared for advertising.' },
  { icon: 'person-remove-outline', title: 'No accounts, no tracking', body: 'There is nothing to sign into. Watch Later has no user accounts and collects no personal data — your watchlist, watched titles, episode progress, favorites, and lists live only in the database on this device. Uninstalling removes everything, so export a backup from More if you ever reinstall.' },
  { icon: 'search-outline', title: 'Catalog metadata', body: 'Movie and TV details come from TMDb and TheTVDB, and anime details come from AniList. Searching the catalog contacts those providers; your personal library is never sent to them.' },
  { icon: 'ban-outline', title: 'No streaming content', body: 'Watch Later is a tracker, not a streaming service. It does not provide, host, or link to video streams.' },
  { icon: 'document-text-outline', title: 'Informational notice', body: 'This page is an informational summary, not a formal legal document. If you have questions about your data, contact support through your app store listing.' },
];

export default function PrivacyScreen() {
  const router = useRouter();
  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Privacy & Terms</AppText></View>

    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name="shield-checkmark" size={26} color={colors.accent} /></View>
      <AppText variant="heading2" style={styles.heroTitle}>Plain language, no small print</AppText>
      <AppText variant="bodySmall" muted style={styles.heroBody}>
        Watch Later is a personal tracker. It collects only what you enter, stores it only on your device, and never monetises it.
      </AppText>
      <View style={styles.chips}>
        {principles.map((principle) => <View key={principle} style={styles.chip}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><AppText variant="caption" style={styles.chipText}>{principle}</AppText></View>)}
      </View>
    </View>

    {sections.map((section, index) => (
      <View key={section.title} style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.badge}><Ionicons name={section.icon} size={17} color={colors.accent} /></View>
          <View style={styles.cardHeadCopy}>
            <AppText variant="caption" muted style={styles.index}>{String(index + 1).padStart(2, '0')}</AppText>
            <AppText variant="heading3">{section.title}</AppText>
          </View>
        </View>
        <AppText variant="bodySmall" muted style={styles.copy}>{section.body}</AppText>
      </View>
    ))}

    <View style={styles.footer}><Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} /><AppText variant="caption" muted>YOUR LIBRARY IS YOURS</AppText></View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  hero: { gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  heroIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  heroTitle: { letterSpacing: -0.4 },
  heroBody: { lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.textSecondary },
  card: { gap: spacing.md, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  cardHeadCopy: { flex: 1, gap: 2 },
  index: { color: colors.accent, letterSpacing: 1.4 },
  copy: { lineHeight: 22 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
