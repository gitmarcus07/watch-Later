import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IconButton } from '@/components/buttons/IconButton';
import { useAppearanceStore, type AppearanceTheme } from '@/store/app/appearanceStore';
import { colors, radius, spacing } from '@/theme';

const options: { value: AppearanceTheme; label: string; detail: string; available: boolean }[] = [
  { value: 'dark', label: 'Dark cinematic', detail: 'The classic Watch Later look', available: true },
];

export default function AppearanceScreen() {
  const router = useRouter();
  const theme = useAppearanceStore((state) => state.theme);
  const setTheme = useAppearanceStore((state) => state.setTheme);

  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Appearance</AppText></View>
    <SectionHeader title="Theme" subtitle="Choose how Watch Later looks on this device." />
    <View style={styles.card}>
      {options.map((option) => {
        const selected = theme === option.value;
        return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${option.label} theme`} accessibilityState={{ selected, disabled: !option.available }} disabled={!option.available} onPress={() => setTheme(option.value)} style={styles.row}>
          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.accent : colors.textMuted} />
          <View style={styles.copy}><AppText variant="bodyMedium">{option.label}</AppText><AppText variant="caption" muted>{option.detail}</AppText></View>
          {selected ? <Ionicons name="checkmark" size={20} color={colors.success} /> : null}
        </Pressable>;
      })}
      <View style={styles.row}>
        <Ionicons name="sunny-outline" size={22} color={colors.textMuted} />
        <View style={styles.copy}><AppText variant="bodyMedium">Light</AppText><AppText variant="caption" muted>Not yet available</AppText></View>
      </View>
    </View>
    <AppText variant="caption" muted style={styles.note}>Your theme choice is saved on this device. More themes are planned for the future.</AppText>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  copy: { flex: 1, gap: 2 },
  note: { marginTop: spacing.lg, lineHeight: 20 },
});
