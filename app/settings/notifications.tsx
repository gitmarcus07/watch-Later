import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { SectionHeader } from '@/components/common/SectionHeader';
import { IconButton } from '@/components/buttons/IconButton';
import { AppButton } from '@/components/buttons/AppButton';
import { useNotificationStore } from '@/store/app/notificationStore';
import { getReminderPermission, refreshReminders } from '@/features/notifications/scheduler';
import { RELEASE_DAY_BODY, releaseDayTitle } from '@/features/notifications/upcomingReminders';
import { sendTestNotification } from '@/features/ott/ottReminders';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { colors, radius, spacing } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const continueWatchingReminders = useNotificationStore((state) => state.continueWatchingReminders);
  const newReleaseReminders = useNotificationStore((state) => state.newReleaseReminders);
  const setPreferences = useNotificationStore((state) => state.setPreferences);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useFocusEffect(useCallback(() => {
    let active = true;
    void getReminderPermission().then((status) => { if (active) setPermission(status); });
    return () => { active = false; };
  }, []));

  const rows = [
    { label: 'Continue Watching reminders', detail: 'Nudge me about series I have in progress', value: continueWatchingReminders, key: 'continueWatchingReminders' as const },
    { label: 'New release reminders', detail: 'Tell me when anticipated titles release', value: newReleaseReminders, key: 'newReleaseReminders' as const },
  ];

  return <Screen scroll>
    <View style={styles.header}><IconButton name="arrow-back" label="Go back" onPress={() => router.back()} /><AppText variant="heading1">Notifications</AppText></View>
    <SectionHeader title="Reminders" subtitle="Choose what you&apos;d like to hear about." />
    <View style={styles.card}>
      {rows.map((row) => <View key={row.key} style={styles.row}>
        <View style={styles.copy}><AppText variant="bodyMedium">{row.label}</AppText><AppText variant="caption" muted>{row.detail}</AppText></View>
        <Switch accessibilityRole="switch" accessibilityLabel={row.label} accessibilityState={{ checked: row.value }} value={row.value} onValueChange={(value) => { setPreferences({ [row.key]: value }); void refreshReminders(); }} trackColor={{ true: colors.accent, false: colors.surfaceElevated }} thumbColor={colors.white} />
      </View>)}
    </View>
    {permission === 'denied' ? <View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} /><AppText variant="bodySmall" muted style={styles.noticeText}>Notifications are blocked in system settings, so reminders can&apos;t appear. Your preferences stay saved on this device.</AppText></View> : null}
    <SectionHeader title="Test" subtitle="Verify alerts work on this device." />
    <AppButton
      label="Send test notification"
      variant="secondary"
      onPress={() => {
        // Preview the real release-day format (first interested title, else
        // the spec sample) instead of diagnostic copy.
        const preview = watchStateRepository.getInterested()
          .then((entries) => {
            const first = entries[0]?.media;
            return first
              ? { title: releaseDayTitle(first.title), body: RELEASE_DAY_BODY }
              : { title: releaseDayTitle('Dune: Part Three'), body: RELEASE_DAY_BODY };
          })
          .catch(() => ({ title: releaseDayTitle('Dune: Part Three'), body: RELEASE_DAY_BODY }));
        void preview.then((custom) => sendTestNotification(custom).then((result) => {
          if (result === 'scheduled') showToast('Release preview arrives in ~10 seconds', 'success');
          else if (result === 'denied') void showDialog({ type: 'warning', title: 'Notifications are blocked', message: 'Allow notifications in system settings, then try again.' });
          else void showDialog({ type: 'error', title: 'Couldn’t schedule the test', message: 'Please try again.' });
        }));
      }}
    />
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
