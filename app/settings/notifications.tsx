import { useRouter } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IconButton } from '@/components/buttons/IconButton';
import { notificationsAvailable, useNotificationStore } from '@/store/app/notificationStore';
import { colors, radius, spacing } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const continueWatchingReminders = useNotificationStore((state) => state.continueWatchingReminders);
  const newReleaseReminders = useNotificationStore((state) => state.newReleaseReminders);
  const setPreferences = useNotificationStore((state) => state.setPreferences);

  const rows = [
    { label: 'Continue Watching reminders', detail: 'Nudge me about series I have in progress', value: continueWatchingReminders, key: 'continueWatchingReminders' as const },
    { label: 'New release reminders', detail: 'Tell me when anticipated titles release', value: newReleaseReminders, key: 'newReleaseReminders' as const },
  ];

  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Notifications</AppText></View>
    <SectionHeader title="Reminders" subtitle="Choose what you'd like to hear about." />
    <View style={styles.card}>
      {rows.map((row) => <View key={row.key} style={styles.row}>
        <View style={styles.copy}><AppText variant="bodyMedium">{row.label}</AppText><AppText variant="caption" muted>{row.detail}</AppText></View>
        <Switch accessibilityRole="switch" accessibilityLabel={row.label} accessibilityState={{ checked: row.value }} value={row.value} onValueChange={(value) => setPreferences({ [row.key]: value })} trackColor={{ true: colors.accent, false: colors.surfaceElevated }} thumbColor={colors.white} />
      </View>)}
    </View>
    {!notificationsAvailable ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.noticeText}>Reminder delivery is not available in this build yet — no notifications will be sent. Your preferences are saved on this device and will apply once delivery lands.</AppText></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  copy: { flex: 1, gap: 2 },
  notice: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.medium },
  noticeText: { flex: 1, lineHeight: 21 },
});
