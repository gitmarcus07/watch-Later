import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { ContinueWatchingCard } from '@/components/media/ContinueWatchingCard';
import { MediaRow } from '@/components/media/MediaRow';
import { mockContinue, mockMedia } from '@/features/catalog/mock/mockMedia';
import { colors, spacing } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const open = (id: string) => router.push({ pathname: '/media/[id]', params: { id } });
  return <Screen scroll><View style={styles.header}><View><AppText variant="caption" muted>YOUR PERSONAL CINEMA</AppText><AppText variant="heading1" style={styles.title}>Good evening.</AppText></View><IconButton name="person-outline" label="Open profile and settings" onPress={() => router.push('/(tabs)/more')} variant="accent" /></View>
    <ContinueWatchingCard title={mockContinue.media.title} subtitle={mockContinue.episode} progress={mockContinue.progress} palette={mockContinue.media.palette} onPress={() => open(mockContinue.media.id)} />
    <MediaRow title="On your watchlist" items={mockMedia.slice(0, 4)} onSeeAll={() => router.push('/(tabs)/watchlist')} onPressItem={open} />
    <MediaRow title="Recently watched" items={[mockMedia[3], mockMedia[4], mockMedia[0]]} onSeeAll={() => router.push('/(tabs)/watched')} onPressItem={open} />
    <View style={styles.note}><Ionicons name="sparkles-outline" size={16} color={colors.accent} /><AppText variant="caption" muted>Preview titles are sample content for this phase.</AppText></View>
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.lg, paddingBottom: spacing.xl }, title: { marginTop: spacing.xs }, note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg } });
