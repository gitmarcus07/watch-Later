import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IconButton } from '@/components/buttons/IconButton';
import { spacing } from '@/theme';

const sections: { title: string; body: string }[] = [
  { title: 'Your watch data stays yours', body: 'Your watchlist, watched titles, episode progress, favorites, and lists are stored in a database on this device. They work fully offline and are never sold or shared for advertising.' },
  { title: 'Optional account and cloud sync', body: 'Using Watch Later as a guest keeps everything on this device. If you create an account and sign in, your library syncs to your private cloud records so it follows you across devices. Signing out keeps your local data in place.' },
  { title: 'Catalog metadata', body: 'Movie and TV details come from TMDb and TheTVDB, and anime details come from AniList. Searching the catalog contacts those providers; your personal library is never sent to them.' },
  { title: 'No streaming content', body: 'Watch Later is a tracker, not a streaming service. It does not provide, host, or link to video streams.' },
  { title: 'Informational notice', body: 'This page is an informational summary, not a formal legal document. If you have questions about your data, contact support through your app store listing.' },
];

export default function PrivacyScreen() {
  const router = useRouter();
  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Privacy & Terms</AppText></View>
    {sections.map((section) => <View key={section.title} style={styles.section}><SectionHeader title={section.title} /><AppText variant="bodySmall" muted style={styles.copy}>{section.body}</AppText></View>)}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  copy: { lineHeight: 22 },
});
