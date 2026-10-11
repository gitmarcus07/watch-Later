import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import type { TitleStatus } from '@/features/watchState/status';
import { STATUS_LABELS } from '@/features/watchState/status';
import { colors, radius, spacing } from '@/theme';

const ORDER: { status: Exclude<TitleStatus, 'none'>; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { status: 'plan', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { status: 'watching', icon: 'play-circle-outline', activeIcon: 'play-circle' },
  { status: 'finished', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle' },
];

/**
 * Plan to Watch / Watching / Finished picker. Movies offer Plan + Finished;
 * series and anime offer all three. Selecting the current status is a no-op.
 */
export function StatusPicker({ mediaType, status, disabled = false, onSelect }: {
  mediaType: 'movie' | 'series' | 'anime';
  status: TitleStatus;
  disabled?: boolean;
  onSelect: (status: Exclude<TitleStatus, 'none'>) => void;
}) {
  const options = ORDER.filter(({ status: option }) => mediaType !== 'movie' || option !== 'watching');
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Watch status">
      {options.map(({ status: option, icon, activeIcon }) => {
        const selected = status === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={STATUS_LABELS[option]}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => { if (!selected) onSelect(option); }}
            style={[styles.option, selected && styles.selected, disabled && styles.disabled]}
          >
            <Ionicons name={selected ? activeIcon : icon} size={19} color={selected ? colors.accent : colors.textSecondary} />
            <AppText variant="label" style={selected ? styles.selectedText : styles.text}>{STATUS_LABELS[option]}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  selected: { borderColor: colors.accent, backgroundColor: 'rgba(182,156,255,0.12)' },
  text: { color: colors.textSecondary },
  selectedText: { color: colors.accent },
  disabled: { opacity: 0.5 },
});
