import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { DialogCard } from '@/components/feedback/AppDialog';
import type { CatalogMedia } from '@/domain/models/media';
import { colors, radius, spacing, typography } from '@/theme';

const TYPES: { label: string; value: CatalogMedia['mediaType'] }[] = [
  { label: 'Movie', value: 'movie' },
  { label: 'Series', value: 'series' },
  { label: 'Anime', value: 'anime' },
];

/**
 * Adds a title the catalogs don't carry (old, indie, or self-made films).
 * Entries sync like any other title and open in the normal detail flow.
 */
export function CustomEntryDialog({ visible, initialTitle = '', onClose, onSave }: {
  visible: boolean;
  initialTitle?: string;
  onClose: () => void;
  onSave: (input: { title: string; year?: number; mediaType: CatalogMedia['mediaType']; notes?: string }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [year, setYear] = useState('');
  const [mediaType, setMediaType] = useState<CatalogMedia['mediaType']>('movie');
  const [notes, setNotes] = useState('');
  // Note: the parent mounts this dialog fresh on every open
  // (`{open ? <CustomEntryDialog/> : null}`), so useState(initialTitle)
  // already resets title/year/type/notes each time — no sync effect needed.
  const parsedYear = Number.parseInt(year, 10);
  const validYear = !year.trim() || (Number.isSafeInteger(parsedYear) && parsedYear >= 1880 && parsedYear <= 2100);
  const valid = title.trim().length > 0 && validYear;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.centered}>
          <DialogCard
            request={{ type: 'info', title: 'Add a custom entry', message: 'For titles no catalog carries. It joins your watchlist like anything else.', primaryAction: { label: 'Add entry' }, secondaryAction: { label: 'Cancel' } }}
            content={
              <View style={styles.fields}>
                <TextInput accessibilityLabel="Custom entry title" placeholder="Title" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} maxLength={120} style={styles.input} selectionColor={colors.accent} />
                <View style={styles.typeRow}>
                  {TYPES.map((option) => (
                    <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${option.label} entry`} accessibilityState={{ selected: mediaType === option.value }} onPress={() => setMediaType(option.value)} style={[styles.typeChip, mediaType === option.value && styles.typeActive]}>
                      <AppText variant="label" style={{ color: mediaType === option.value ? colors.accent : colors.textSecondary }}>{option.label}</AppText>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.split}>
                  <View style={styles.splitField}>
                    <AppText variant="caption" muted>Year (optional)</AppText>
                    <TextInput accessibilityLabel="Release year" placeholder="2024" placeholderTextColor={colors.textMuted} value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} style={styles.input} selectionColor={colors.accent} />
                  </View>
                  <View style={styles.splitField}>
                    <AppText variant="caption" muted>Notes (optional)</AppText>
                    <TextInput accessibilityLabel="Notes" placeholder="Where you saw it…" placeholderTextColor={colors.textMuted} value={notes} onChangeText={setNotes} maxLength={280} style={styles.input} selectionColor={colors.accent} />
                  </View>
                </View>
              </View>
            }
            onPrimary={() => { if (valid) onSave({ title: title.trim(), year: year.trim() ? parsedYear : undefined, mediaType, notes: notes.trim() || undefined }); }}
            onSecondary={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centered: { width: '100%', maxWidth: 380 },
  fields: { gap: spacing.md, width: '100%' },
  input: { minHeight: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, paddingHorizontal: spacing.lg, ...typography.body },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  typeActive: { borderColor: colors.accent },
  split: { flexDirection: 'row', gap: spacing.md },
  splitField: { flex: 1, gap: spacing.xs },
});
