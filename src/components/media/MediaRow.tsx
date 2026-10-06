import { FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { PosterCard } from './PosterCard';
import { PreviewMedia } from '@/features/catalog/mock/mockMedia';
import { spacing } from '@/theme';

export function MediaRow({ title, items, onSeeAll, onPressItem }: { title: string; items: PreviewMedia[]; onSeeAll?: () => void; onPressItem?: (id: string) => void }) {
  return <View style={styles.section}>
    <View style={styles.header}><AppText variant="heading3">{title}</AppText>{onSeeAll ? <IconButton name="chevron-forward" label={`See all ${title}`} onPress={onSeeAll} size={18} variant="subtle" /> : null}</View>
    <FlatList horizontal data={items} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => <PosterCard title={item.title} subtitle={item.subtitle} palette={item.palette} onPress={() => onPressItem?.(item.id)} />} />
  </View>;
}

const styles = StyleSheet.create({ section: { marginBottom: spacing['2xl'] }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, list: { gap: spacing.md, paddingRight: spacing.xl }, });
