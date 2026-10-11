import { useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { DialogCard } from '@/components/feedback/AppDialog';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "I'm on S2E7" input rendered inside the themed dialog card.
 * Saving marks every episode up to the entered position as watched.
 */
export function SetProgressDialog({ visible, mediaTitle, initialSeason = 1, onClose, onSave }: {
  visible: boolean;
  mediaTitle: string;
  initialSeason?: number;
  onClose: () => void;
  onSave: (seasonNumber: number, episodeNumber: number) => void;
}) {
  const [season, setSeason] = useState(String(initialSeason));
  const [episode, setEpisode] = useState('');
  // Note: the parent remounts this dialog per target season via `key`, so
  // fresh fields are guaranteed on every open without a sync effect.
  const seasonNumber = Number.parseInt(season, 10);
  const episodeNumber = Number.parseInt(episode, 10);
  const valid = Number.isSafeInteger(seasonNumber) && seasonNumber >= 0 && Number.isSafeInteger(episodeNumber) && episodeNumber >= 1;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.centered}>
          <DialogCard
            request={{ type: 'info', title: 'Where are you?', message: `Mark everything up to an episode of ${mediaTitle} as watched.`, primaryAction: { label: 'Save progress' }, secondaryAction: { label: 'Cancel' } }}
            content={
              <View style={styles.fields}>
                <View style={styles.field}>
                  <AppText variant="caption" muted>Season</AppText>
                  <TextInput accessibilityLabel="Season number" value={season} onChangeText={setSeason} keyboardType="number-pad" returnKeyType="next" maxLength={3} style={styles.input} selectionColor={colors.accent} />
                </View>
                <View style={styles.field}>
                  <AppText variant="caption" muted>Episode</AppText>
                  <TextInput accessibilityLabel="Episode number" value={episode} onChangeText={setEpisode} keyboardType="number-pad" returnKeyType="done" maxLength={4} style={styles.input} selectionColor={colors.accent} />
                </View>
                {!valid && (season || episode) ? <AppText variant="caption" style={styles.hint}>Enter a season (0+) and an episode (1+).</AppText> : null}
              </View>
            }
            onPrimary={() => { if (valid) { onSave(seasonNumber, episodeNumber); onClose(); } }}
            onSecondary={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centered: { width: '100%', maxWidth: 360 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, width: '100%' },
  field: { flex: 1, gap: spacing.xs, minWidth: 120 },
  hint: { width: '100%', color: colors.warning },
  input: { minHeight: 56, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, paddingHorizontal: spacing.lg, ...typography.body },
});
