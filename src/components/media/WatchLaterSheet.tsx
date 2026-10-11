import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { PRIORITY_META, PRIORITY_ORDER } from '@/features/watchState/priority';
import type { WatchPriority } from '@/domain/models/watchState';
import { colors, radius, spacing } from '@/theme';

interface WatchLaterSheetProps {
  visible: boolean;
  saved: boolean;
  currentPriority: WatchPriority | null;
  busy?: boolean;
  onSelect: (priority: WatchPriority) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function WatchLaterSheet({ visible, saved, currentPriority, busy, onSelect, onRemove, onClose }: WatchLaterSheetProps) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss watch later options" onPress={onClose} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="heading2">Watch Later</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close watch later options" onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {PRIORITY_ORDER.map((priority) => {
            const meta = PRIORITY_META[priority];
            const selected = currentPriority === priority;
            return (
              <Pressable
                key={priority}
                accessibilityRole="radio"
                accessibilityLabel={`${meta.label}, ${meta.description}`}
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => onSelect(priority)}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && !busy && styles.pressed]}
              >
                <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.success : colors.textMuted} />
                <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
                <View style={styles.optionCopy}>
                  <AppText variant="bodyMedium">{meta.label}</AppText>
                  <AppText variant="bodySmall" muted>{meta.description}</AppText>
                </View>
              </Pressable>
            );
          })}
          {saved ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove from watchlist"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onRemove}
              style={({ pressed }) => [styles.remove, pressed && !busy && styles.pressed]}
            >
              <AppText variant="button" style={styles.removeText}>Remove from Watchlist</AppText>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'], gap: spacing.sm },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.sm },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: 'transparent' },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceElevated },
  optionCopy: { flex: 1, gap: 2 },
  remove: { alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm },
  removeText: { color: colors.error },
  pressed: { opacity: 0.8 },
});
