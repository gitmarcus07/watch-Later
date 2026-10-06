import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import type { CatalogMedia } from '@/domain/models/media';
import type { LibraryStatus } from '@/domain/models/watchState';
import { useMovieWatchedMutation, useSeriesTrackingMutation, useWatchlistMutation } from '@/features/watchState/hooks';
import { colors, radius, spacing } from '@/theme';

export function SearchResultCard({ media, onPress, status }: { media: CatalogMedia; onPress: () => void; status?: LibraryStatus }) {
  const [failedUri, setFailedUri] = useState<string>();
  const watchlist = useWatchlistMutation(media, status?.watchlisted ?? false);
  const movie = useMovieWatchedMutation(media, status?.movieWatched ?? false);
  const tracking = useSeriesTrackingMutation(media, status?.tracking ?? false);
  const action = media.mediaType === 'movie' ? movie : tracking;
  useEffect(() => {
    const error = watchlist.error ?? action.error;
    if (error instanceof Error) Alert.alert('Couldn’t update your library', error.message || 'Try again.');
  }, [watchlist.error, action.error]);
  const posterFailed = failedUri === media.posterUrl;
  const typeLabel = media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'TV series' : 'Anime';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${media.title}${media.year ? `, ${media.year}` : ''}, ${typeLabel}${media.rating === undefined ? '' : `, rating ${media.rating.toFixed(1)}`}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${media.title}`} onPress={onPress} style={styles.poster}>
      {media.posterUrl && !posterFailed ? <Image source={{ uri: media.posterUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailedUri(media.posterUrl)} /> : <LinearGradient colors={['#51416C', '#202637']} style={[StyleSheet.absoluteFill, styles.posterFallback]}><AppText variant="caption" style={styles.posterTitle} numberOfLines={3}>{media.title.toUpperCase()}</AppText></LinearGradient>}
    </Pressable>
    <View style={styles.copy}><AppText variant="bodyMedium" numberOfLines={1}>{media.title}</AppText><AppText variant="caption" muted>{[media.year, typeLabel].filter(Boolean).join(' · ')}</AppText>{media.rating !== undefined ? <View style={styles.rating}><Ionicons name="star" size={13} color={colors.accent} /><AppText variant="caption" muted>{media.rating.toFixed(1)}</AppText></View> : null}</View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${status?.watchlisted ? 'Remove' : 'Add'} ${media.title} ${status?.watchlisted ? 'from' : 'to'} watchlist`} accessibilityState={{ selected: status?.watchlisted ?? false, disabled: !status || watchlist.isPending }} disabled={!status || watchlist.isPending} onPress={() => watchlist.mutate()} style={[styles.add, status?.watchlisted && styles.added]}><Ionicons name={status?.watchlisted ? 'checkmark' : 'add'} size={21} color={status?.watchlisted ? colors.success : colors.accent} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={media.mediaType === 'movie' ? `${status?.movieWatched ? 'Mark' : 'Mark'} ${media.title} ${status?.movieWatched ? 'unwatched' : 'watched'}` : `${status?.tracking ? 'Stop tracking' : 'Start tracking'} ${media.title}`} accessibilityState={{ selected: media.mediaType === 'movie' ? status?.movieWatched : status?.tracking, disabled: !status || action.isPending }} disabled={!status || action.isPending} onPress={() => action.mutate()} style={[styles.add, (media.mediaType === 'movie' ? status?.movieWatched : status?.tracking) && styles.added]}><Ionicons name={media.mediaType === 'movie' ? (status?.movieWatched ? 'checkmark-circle' : 'checkmark-circle-outline') : (status?.tracking ? 'play' : 'play-outline')} size={19} color={(media.mediaType === 'movie' ? status?.movieWatched : status?.tracking) ? colors.success : colors.accent} /></Pressable>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({ row: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, poster: { width: 62, height: 84, borderRadius: radius.small, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.surfaceElevated }, posterFallback: { justifyContent: 'flex-end', padding: spacing.xs }, posterTitle: { color: colors.white, fontSize: 9, lineHeight: 11, textShadowColor: '#000', textShadowRadius: 5 }, copy: { flex: 1, gap: spacing.xs }, rating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, actions: { gap: spacing.xs }, add: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(182,156,255,0.12)', alignItems: 'center', justifyContent: 'center' }, added: { backgroundColor: 'rgba(117,214,162,0.12)' }, pressed: { opacity: 0.78 } });
