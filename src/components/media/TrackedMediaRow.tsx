import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import type { CatalogMedia } from '@/domain/models/media';
import { colors, radius, spacing } from '@/theme';

export function TrackedMediaRow({ media, subtitle, badge, progress, actionLabel, actionIcon, onPress, onAction, actionDisabled = false }: {
  media: CatalogMedia; subtitle?: string; badge?: string; progress?: number; actionLabel?: string; actionIcon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void; onAction?: () => void; actionDisabled?: boolean;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${media.title}`} accessibilityHint="Opens title details" onPress={onPress} style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
      {media.posterUrl && !posterFailed ? <Image source={{ uri: media.posterUrl }} style={styles.poster} resizeMode="cover" onError={() => setPosterFailed(true)} /> : <View style={[styles.poster, styles.posterFallback]}><Ionicons name="film-outline" size={23} color={colors.accent} /></View>}
      <View style={styles.copy}><AppText variant="bodyMedium" numberOfLines={1}>{media.title}</AppText><AppText variant="caption" muted numberOfLines={1}>{subtitle ?? [media.year, media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'TV series' : 'Anime'].filter(Boolean).join(' · ')}</AppText>{badge ? <AppText variant="caption" style={styles.badge}>{badge}</AppText> : null}{typeof progress === 'number' ? <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} /></View> : null}</View>
    </Pressable>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ disabled: actionDisabled }} disabled={actionDisabled} onPress={onAction} style={({ pressed }) => [styles.action, pressed && styles.pressed, actionDisabled && styles.disabled]}><Ionicons name={actionIcon ?? 'close'} size={20} color={colors.accent} /></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', minHeight: 104, gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, poster: { width: 62, height: 88, borderRadius: radius.small, backgroundColor: colors.surfaceElevated }, posterFallback: { alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: spacing.xs }, badge: { color: colors.accent }, progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginTop: spacing.xs }, progressFill: { height: 4, backgroundColor: colors.accent }, action: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated }, pressed: { opacity: 0.78 }, disabled: { opacity: 0.4 } });
