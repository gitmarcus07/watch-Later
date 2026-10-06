import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { useViewingHistory } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { spacing } from '@/theme';

export default function HistoryScreen() {
  const router = useRouter();
  const historyQuery = useViewingHistory(50);
  const entries = historyQuery.data ?? [];

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><View style={styles.title}><AppText variant="heading1">History</AppText><AppText variant="bodySmall" muted>Everything you have watched, newest first</AppText></View></View>
    {historyQuery.isLoading ? <LoadingView label="Loading your history" />
      : historyQuery.isError ? <ErrorView message="Couldn't load your history. Your data is safe." onRetry={() => void historyQuery.refetch()} />
      : entries.length ? <FlatList data={entries} keyExtractor={(item, index) => `${item.kind}:${item.kind === 'episode' ? item.episode.providerId : item.media.id}:${index}`} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => {
        if (item.kind === 'movie') {
          return <TrackedMediaRow media={item.media} badge="Watched" onPress={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media) } })} />;
        }
        return <TrackedMediaRow media={item.media} subtitle={`S${item.episode.seasonNumber} E${item.episode.episodeNumber} · ${item.episode.title}`} badge="Episode watched" onPress={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media), season: String(item.episode.seasonNumber) } })} />;
      }} /> : <EmptyState icon="time-outline" title="No history yet" message="Movies and episodes you finish will appear here in the order you watched them." actionLabel="Explore titles" onAction={() => router.push('/(tabs)/search')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { flex: 1, gap: spacing.xs },
  list: { paddingBottom: spacing['2xl'] },
});
