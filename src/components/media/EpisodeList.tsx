import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { colors, radius, spacing } from '@/theme';

export function SeasonSelector({ season, onPress }: { season: string; onPress?: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Select ${season}`} onPress={onPress} style={styles.season}><AppText variant="heading3">{season}</AppText><Ionicons name="chevron-down" size={18} color={colors.textSecondary} /></Pressable>;
}

export function EpisodeList({ episodes = ['Pilot', 'The First Step', 'The Long Way Home'], watched = [true] }: { episodes?: string[]; watched?: boolean[] }) {
  return <View>{episodes.map((episode, index) => { const complete = watched[index] ?? false; return <View key={`${index}-${episode}`} style={styles.episode}><View style={[styles.number, complete && styles.numberWatched]}><AppText variant="caption" color={complete ? colors.background : colors.textSecondary}>{index + 1}</AppText></View><View style={styles.copy}><AppText variant="bodyMedium">Episode {index + 1}</AppText><AppText variant="caption" muted>{episode}</AppText></View><Ionicons name={complete ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={complete ? colors.success : colors.textMuted} /></View>; })}</View>;
}

const styles = StyleSheet.create({ season: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium, padding: spacing.lg, marginBottom: spacing.sm }, episode: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, number: { width: 34, height: 34, borderRadius: radius.small, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }, numberWatched: { backgroundColor: colors.success }, copy: { flex: 1, gap: 2 } });
