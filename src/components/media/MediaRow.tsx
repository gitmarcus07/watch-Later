import { FlatList, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { IconButton } from '@/components/buttons/IconButton';
import { PosterCard } from './PosterCard';
import { useIsTablet } from '@/theme/responsive';
import { spacing } from '@/theme';

export interface MediaRowItem { id: string; title: string; subtitle?: string; posterUri?: string; palette?: readonly [string, string] }

export function MediaRow({ title, items, onSeeAll, onPressItem }: { title: string; items: MediaRowItem[]; onSeeAll?: () => void; onPressItem?: (id: string) => void }) {
  const tablet = useIsTablet();
  const posterWidth = tablet ? 156 : 132;
  return <View style={styles.section}>
    <View style={styles.header}><AppText variant="heading3">{title}</AppText>{onSeeAll ? <IconButton name="chevron-forward" label={`See all ${title}`} onPress={onSeeAll} size={18} variant="subtle" /> : null}</View>
    <FlatList horizontal data={items} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} renderItem={({ item }) => <PosterCard title={item.title} subtitle={item.subtitle} posterUri={item.posterUri} palette={item.palette} width={posterWidth} onPress={() => onPressItem?.(item.id)} />} />
  </View>;
}

const styles = StyleSheet.create({ section: { marginBottom: spacing['2xl'] }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, list: { gap: spacing.md, paddingRight: spacing.xl }, });
