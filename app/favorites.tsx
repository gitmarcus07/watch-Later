import { useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { useFavoriteMutation, useFavorites } from '@/features/watchState/hooks';
import { mediaRouteId } from '@/features/catalog/mediaIdentity';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import type { CatalogMedia } from '@/domain/models/media';
import { spacing } from '@/theme';

function FavoriteRow({ media, onOpen }: { media: CatalogMedia; onOpen: () => void }) {
  const mutation = useFavoriteMutation(media, true);
  return <TrackedMediaRow media={media} onPress={onOpen} actionLabel={`Remove ${media.title} from favorites`} actionIcon="heart" actionDisabled={mutation.isPending} onAction={() => mutation.mutate(undefined, { onError: (error) => Alert.alert('Couldn’t update your favorites', friendlyErrorMessage(error)) })} />;
}

export default function FavoritesScreen() {
  const router = useRouter();
  const favoritesQuery = useFavorites();
  const entries = favoritesQuery.data ?? [];

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><View style={styles.title}><AppText variant="heading1">Favorites</AppText><AppText variant="bodySmall" muted>{entries.length} {entries.length === 1 ? 'title' : 'titles'} · syncs when you sign in</AppText></View></View>
    {favoritesQuery.isLoading ? <LoadingView label="Loading your favorites" />
      : favoritesQuery.isError ? <ErrorView message="Couldn't load your favorites. Your data is safe." onRetry={() => void favoritesQuery.refetch()} />
      : entries.length ? <FlatList data={entries} keyExtractor={(item) => item.media.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => (
        <FavoriteRow media={item.media} onOpen={() => router.push({ pathname: '/media/[id]', params: { id: mediaRouteId(item.media) } })} />
      )} /> : <EmptyState icon="heart-outline" title="No favorites yet" message="Mark titles you love and they'll wait for you here on every device." actionLabel="Find something to love" onAction={() => router.push('/(tabs)/search')} />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { flex: 1, gap: spacing.xs },
  list: { paddingBottom: spacing['2xl'] },
});
