import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { useCustomList, useRemoveFromCustomList } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { spacing } from '@/theme';

export default function ListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = typeof id === 'string' ? id : undefined;
  const listQuery = useCustomList(listId);
  const removeMutation = useRemoveFromCustomList();
  const items = listQuery.data?.items ?? [];

  const remove = (identity: { provider: 'tmdb' | 'anilist'; mediaType: 'movie' | 'series' | 'anime'; providerId: string }) => {
    if (!listId) return;
    removeMutation.mutate({ listId, identity }, {
      onError: (error) => Alert.alert('Couldn’t update your list', friendlyErrorMessage(error)),
    });
  };

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><View style={styles.title}><AppText variant="heading1" numberOfLines={1}>{listQuery.data?.name ?? 'List'}</AppText><AppText variant="bodySmall" muted>{items.length} {items.length === 1 ? 'title' : 'titles'} · stored on this device</AppText></View></View>
    {listQuery.isLoading ? <LoadingView label="Loading list" />
      : listQuery.isError || !listQuery.data ? <ErrorView message="Couldn't load this list. Your data is safe." onRetry={() => void listQuery.refetch()} />
      : items.length ? <FlatList data={items} keyExtractor={(item) => item.media.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => (
        <TrackedMediaRow media={item.media} onPress={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media) } })} actionLabel={`Remove ${item.media.title} from list`} actionIcon="close" actionDisabled={removeMutation.isPending} onAction={() => remove(item.media)} />
      )} /> : <EmptyState icon="list-outline" title="This list is empty" message="Open any title and choose Save to list to start filling it." actionLabel="Find something to add" onAction={() => router.push('/(tabs)/search')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { flex: 1, gap: spacing.xs },
  list: { paddingBottom: spacing['2xl'] },
});
