import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { IconButton } from '@/components/buttons/IconButton';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorView, LoadingView } from '@/components/feedback/FeedbackViews';
import { useCreateCustomList, useCustomLists, useDeleteCustomList } from '@/features/watchState/hooks';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { colors, radius, spacing, typography } from '@/theme';

export default function ListsScreen() {
  const router = useRouter();
  const listsQuery = useCustomLists();
  const createMutation = useCreateCustomList();
  const deleteMutation = useDeleteCustomList();
  const [name, setName] = useState('');
  const lists = listsQuery.data ?? [];

  const create = () => {
    if (!name.trim()) return;
    createMutation.mutate(name.trim(), {
      onSuccess: () => setName(''),
      onError: (error) => Alert.alert('Couldn’t create your list', friendlyErrorMessage(error)),
    });
  };

  const remove = (id: string, listName: string) => {
    Alert.alert('Delete list?', `"${listName}" and its entries will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id, { onError: (error) => Alert.alert('Couldn’t delete your list', friendlyErrorMessage(error)) }) },
    ]);
  };

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Lists</AppText></View>
    <View style={styles.createRow}>
      <TextInput accessibilityLabel="New list name" placeholder="New list name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} onSubmitEditing={create} returnKeyType="done" maxLength={80} style={styles.input} selectionColor={colors.accent} />
      <AppButton label="Create" onPress={create} loading={createMutation.isPending} disabled={!name.trim()} />
    </View>
    {listsQuery.isLoading ? <LoadingView label="Loading your lists" />
      : listsQuery.isError ? <ErrorView message="Couldn't load your lists. Your data is safe." onRetry={() => void listsQuery.refetch()} />
      : lists.length ? <FlatList data={lists} keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => (
        <View style={styles.listRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}, ${item.itemCount} titles`} accessibilityHint="Opens list details" onPress={() => router.push({ pathname: '/lists/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.listContent, pressed && styles.pressed]}>
            <View style={styles.listIcon}><Ionicons name="list-outline" size={20} color={colors.accent} /></View>
            <View style={styles.listCopy}><AppText variant="bodyMedium" numberOfLines={1}>{item.name}</AppText><AppText variant="caption" muted>{item.itemCount} {item.itemCount === 1 ? 'title' : 'titles'}</AppText></View>
            <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
          </Pressable>
          <IconButton name="trash-outline" label={`Delete ${item.name}`} onPress={() => remove(item.id, item.name)} variant="subtle" size={19} />
        </View>
      )} /> : <EmptyState icon="list-outline" title="No lists yet" message="Create themed collections — comfort rewatches, watch-party picks, anything you like." />}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  createRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  input: { flex: 1, minHeight: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: spacing.lg, ...typography.body },
  list: { paddingBottom: spacing['2xl'] },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  listContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  listCopy: { flex: 1, gap: 2 },
  pressed: { opacity: 0.78 },
});
