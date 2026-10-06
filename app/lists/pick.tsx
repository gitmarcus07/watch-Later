import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { IconButton } from '@/components/buttons/IconButton';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { parseMediaRouteId } from '@/features/catalog/mediaIdentity';
import { useCatalogMedia } from '@/features/catalog/hooks';
import { useAddToCustomList, useCreateCustomList, useCustomLists, useTrackedMedia } from '@/features/watchState/hooks';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { colors, radius, spacing, typography } from '@/theme';

export default function PickListScreen() {
  const router = useRouter();
  const { media: mediaParam } = useLocalSearchParams<{ media: string }>();
  const identity = typeof mediaParam === 'string' ? parseMediaRouteId(mediaParam) : undefined;
  const localMediaQuery = useTrackedMedia(identity);
  const catalogMediaQuery = useCatalogMedia(localMediaQuery.data ? undefined : identity);
  const media = localMediaQuery.data ?? catalogMediaQuery.data;
  const listsQuery = useCustomLists();
  const addMutation = useAddToCustomList();
  const createMutation = useCreateCustomList();
  const [name, setName] = useState('');
  const lists = listsQuery.data ?? [];

  const add = (listId: string) => {
    if (!media) return;
    addMutation.mutate({ listId, media }, {
      onSuccess: () => router.back(),
      onError: (error) => Alert.alert('Couldn’t add to your list', friendlyErrorMessage(error)),
    });
  };

  const createAndAdd = () => {
    if (!name.trim() || !media) return;
    createMutation.mutate(name.trim(), {
      onSuccess: (list) => { setName(''); add(list.id); },
      onError: (error) => Alert.alert('Couldn’t create your list', friendlyErrorMessage(error)),
    });
  };

  if (!identity) return <Screen><View style={styles.center}><ErrorView message="This media link is not valid." onRetry={() => router.back()} /></View></Screen>;

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><View style={styles.title}><AppText variant="heading1">Save to list</AppText><AppText variant="bodySmall" muted numberOfLines={1}>{media?.title ?? 'Choose a list'}</AppText></View></View>
    <View style={styles.createRow}>
      <TextInput accessibilityLabel="New list name" placeholder="New list" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} onSubmitEditing={createAndAdd} returnKeyType="done" maxLength={80} style={styles.input} selectionColor={colors.accent} />
      <AppButton label="New" onPress={createAndAdd} loading={createMutation.isPending} disabled={!name.trim() || !media} />
    </View>
    {listsQuery.isLoading ? <LoadingView label="Loading your lists" />
      : listsQuery.isError ? <ErrorView message="Couldn't load your lists. Your data is safe." onRetry={() => void listsQuery.refetch()} />
      : lists.length ? <FlatList data={lists} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Save to ${item.name}, ${item.itemCount} titles`} onPress={() => add(item.id)} disabled={!media || addMutation.isPending} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.icon}><Ionicons name="list-outline" size={20} color={colors.accent} /></View>
          <View style={styles.copy}><AppText variant="bodyMedium" numberOfLines={1}>{item.name}</AppText><AppText variant="caption" muted>{item.itemCount} {item.itemCount === 1 ? 'title' : 'titles'}</AppText></View>
          <Ionicons name="add" size={20} color={colors.accent} />
        </Pressable>
      )} /> : <EmptyState icon="list-outline" title="No lists yet" message="Create your first list above, then save this title to it." />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  title: { flex: 1, gap: spacing.xs },
  center: { flex: 1 },
  createRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  input: { flex: 1, minHeight: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: spacing.lg, ...typography.body },
  list: { paddingBottom: spacing['2xl'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  pressed: { opacity: 0.78 },
});
