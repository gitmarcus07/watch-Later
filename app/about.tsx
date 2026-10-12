import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { colors, radius, spacing } from '@/theme';

const version = Constants.expoConfig?.version ?? '1.0.0';

export default function AboutScreen() {
  const router = useRouter();
  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">About</AppText></View>
    <View style={styles.hero}><View style={styles.icon}><Ionicons name="film" size={30} color={colors.accent} /></View><AppText variant="heading2">Watch Later</AppText><AppText variant="caption" muted>WATCH LATER · VERSION {version}</AppText></View>
    <AppText variant="body" style={styles.copy}>Watch Later is a personal tracker for movies, TV series, and anime. Save what you want to watch, track what you finish, and pick up right where you left off — on this device, with optional cloud sync when you sign in.</AppText>
    <View style={styles.card}>
      <AppText variant="heading3">Acknowledgements</AppText>
      <AppText variant="bodySmall" muted style={styles.copy}>Movie and TV metadata is provided by TMDb. This product uses the TMDb API but is not endorsed or certified by TMDb.</AppText>
      <AppText variant="bodySmall" muted style={styles.copy}>Some movie and series details, including age ratings and credits, are provided by TheTVDB.com. This product uses TheTVDB.com data but is not endorsed or certified by TheTVDB.com.</AppText>
      <AppText variant="bodySmall" muted style={styles.copy}>Anime metadata is provided by AniList.</AppText>
      <AppText variant="bodySmall" muted style={styles.copy}>Watch Later does not provide or host any streaming content.</AppText>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  icon: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  copy: { lineHeight: 23 },
  card: { gap: spacing.md, marginTop: spacing.xl, padding: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
});
