import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import type { CatalogMedia } from '@/domain/models/media';
import { useRatingSettings, formatRating } from '@/store/app/ratingSettings';
import { colors, radius, spacing } from '@/theme';

function Stars({ value, onPick }: { value: number; onPick: (value: number) => void }) {
  return (
    <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((star) => (
        <Pressable key={star} accessibilityRole="radio" accessibilityLabel={`${star} out of 10`} accessibilityState={{ selected: value >= star }} onPress={() => onPick(star)} hitSlop={4}>
          <Ionicons name={value >= star ? 'star' : 'star-outline'} size={24} color={value >= star ? colors.accent : colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Optional rating editor. Rating is never required: Save persists, Skip and
 * backdrop/back close without saving. Thumbs work with or without stars.
 */
export function RatingSheet({ media, initialRating, initialThumbs, onSave, onClose }: {
  media: CatalogMedia;
  initialRating: number | null;
  initialThumbs: -1 | 0 | 1;
  onSave: (rating: number | null, thumbs: -1 | 0 | 1) => void;
  onClose: () => void;
}) {
  const precision = useRatingSettings((state) => state.precision);
  // Reset by the parent via key={media.id} whenever a different title is rated.
  const [rating, setRating] = useState<number | null>(initialRating);
  const [thumbs, setThumbs] = useState<-1 | 0 | 1>(initialThumbs);
  const step = 0.1;
  const nudge = (delta: number) => setRating((current) => {
    const base = current ?? 0;
    const next = Math.min(10, Math.max(0, Math.round((base + delta) * 10) / 10));
    return next;
  });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close rating editor" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.card} accessibilityLabel={`Rate ${media.title}`} accessibilityLiveRegion="polite">
          <AppText variant="heading3" style={styles.title}>Rate this title</AppText>
          <AppText variant="bodyMedium" numberOfLines={1} style={styles.subtitle}>{media.title}</AppText>
          <Stars value={Math.round(rating ?? 0)} onPick={(star) => setRating(star)} />
          <View style={styles.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Decrease rating" onPress={() => nudge(-step)} style={styles.stepButton}><Ionicons name="remove" size={20} color={colors.accent} /></Pressable>
            <AppText variant="heading2" style={styles.value}>{rating === null ? '–' : formatRating(rating, precision)}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Increase rating" onPress={() => nudge(step)} style={styles.stepButton}><Ionicons name="add" size={20} color={colors.accent} /></Pressable>
          </View>
          <View style={styles.thumbs}>
            <Pressable accessibilityRole="button" accessibilityLabel="Thumbs up" accessibilityState={{ selected: thumbs === 1 }} onPress={() => setThumbs(thumbs === 1 ? 0 : 1)} style={[styles.thumb, thumbs === 1 && styles.thumbActive]}><Ionicons name={thumbs === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={20} color={thumbs === 1 ? colors.success : colors.textSecondary} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Thumbs down" accessibilityState={{ selected: thumbs === -1 }} onPress={() => setThumbs(thumbs === -1 ? 0 : -1)} style={[styles.thumb, thumbs === -1 && styles.thumbActive]}><Ionicons name={thumbs === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={20} color={thumbs === -1 ? colors.error : colors.textSecondary} /></Pressable>
            {(rating !== null || thumbs !== 0) ? <Pressable accessibilityRole="button" accessibilityLabel="Clear rating" onPress={() => { setRating(null); setThumbs(0); }}><AppText variant="label" style={styles.clear}>Clear</AppText></Pressable> : null}
          </View>
          <View style={styles.actions}>
            <View style={styles.action}><AppButton label="Skip" variant="secondary" onPress={onClose} /></View>
            <View style={styles.action}><AppButton label="Save rating" onPress={() => onSave(rating, thumbs)} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  title: { color: colors.textPrimary },
  subtitle: { color: colors.textSecondary },
  stars: { flexDirection: 'row', gap: 2, marginTop: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  value: { color: colors.textPrimary, minWidth: 72, textAlign: 'center' },
  thumbs: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  thumbActive: { borderColor: colors.border },
  clear: { color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.md, width: '100%', marginTop: spacing.sm },
  action: { flex: 1 },
});
