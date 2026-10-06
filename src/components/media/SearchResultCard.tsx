import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { PreviewMedia } from '@/features/catalog/mock/mockMedia';
import { colors, radius, spacing } from '@/theme';

export function SearchResultCard({ media, onPress }: { media: PreviewMedia; onPress: () => void }) {
  const [saved, setSaved] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${media.title}, ${media.year}, ${media.kind}, rating ${media.rating}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${media.title}`} onPress={onPress} style={styles.poster}>
      <LinearGradient colors={[...media.palette]} style={StyleSheet.absoluteFill} />
      <AppText variant="caption" style={styles.posterTitle} numberOfLines={3}>{media.title.toUpperCase()}</AppText>
    </Pressable>
    <View style={styles.copy}><AppText variant="bodyMedium" numberOfLines={1}>{media.title}</AppText><AppText variant="caption" muted>{media.year} · {media.kind}</AppText><View style={styles.rating}><Ionicons name="star" size={13} color={colors.accent} /><AppText variant="caption" muted>{media.rating}</AppText></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${saved ? 'Remove' : 'Add'} ${media.title} ${saved ? 'from' : 'to'} watchlist`} accessibilityState={{ selected: saved }} onPress={() => setSaved((current) => !current)} style={[styles.add, saved && styles.added]}><Ionicons name={saved ? 'checkmark' : 'add'} size={21} color={saved ? colors.success : colors.accent} /></Pressable>
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, poster: { width: 62, height: 84, borderRadius: radius.small, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.xs }, posterTitle: { color: colors.white, fontSize: 9, lineHeight: 11, textShadowColor: '#000', textShadowRadius: 5 }, copy: { flex: 1, gap: spacing.xs }, rating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, add: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(182,156,255,0.12)', alignItems: 'center', justifyContent: 'center' }, added: { backgroundColor: 'rgba(117,214,162,0.12)' }, pressed: { opacity: 0.78 } });
