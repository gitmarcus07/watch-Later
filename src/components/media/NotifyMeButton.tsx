import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import type { CatalogMedia } from '@/domain/models/media';
import { useInterestedMutation, useInterestedStatus } from '@/features/watchState/hooks';
import { setUpcomingReminder } from '@/features/notifications/upcomingReminders';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

/**
 * Bell + short label for upcoming titles ("Notify me on release"). Tapping
 * flips the interest mark instantly and arms (or cancels) the branded
 * release-day alert.
 */
export function NotifyMeButton({ media }: { media: CatalogMedia }) {
  const identity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId } as const;
  const status = useInterestedStatus(identity);
  const mutation = useInterestedMutation(media, status.data ?? false);
  const active = status.data ?? false;

  async function toggle() {
    if (status.isLoading || mutation.isPending) return;
    const next = !active;
    triggerLightHaptic();
    mutation.mutate(undefined, {
      onSuccess: () => {
        void setUpcomingReminder(media, next).then((result) => {
          if (result.status === 'scheduled') {
            triggerSuccessHaptic();
            showToast('We’ll notify you on release day', 'success');
          } else if (result.status === 'saved') {
            showToast('Marked interested', 'info');
          } else if (result.status === 'denied') {
            void showDialog({ type: 'warning', title: 'Notifications are blocked', message: 'Your interest is saved, but the release alert can’t appear until notifications are allowed in system settings.' });
          } else if (result.status === 'unavailable') {
            void showDialog({
              type: 'error',
              title: 'Couldn’t set the reminder',
              message: result.reason === 'expo-go'
                ? 'You’re previewing in Expo Go, which can’t fire reminder alerts. Your interest is saved — open this project in the Watch Later dev build and tap the bell again to arm the alert.'
                : 'Your interest is saved. Please try the reminder again later.',
            });
          } else {
            showToast('Release reminder removed', 'info');
          }
        });
      },
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `Stop notifying about ${media.title}` : `Notify me about ${media.title} on release`}
      accessibilityState={{ selected: active, busy: mutation.isPending, disabled: status.isLoading }}
      onPress={() => void toggle()}
      disabled={status.isLoading || mutation.isPending}
      style={({ pressed }) => [styles.button, active && styles.buttonActive, pressed && styles.pressed]}
    >
      <Ionicons name={active ? 'notifications' : 'notifications-outline'} size={17} color={active ? colors.white : colors.accent} />
      <AppText variant="button" style={active ? styles.labelActive : styles.label} numberOfLines={1}>
        {active ? 'Reminder on' : 'Notify me on release'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginTop: spacing.md,
  },
  buttonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { color: colors.accent, fontSize: 14 },
  labelActive: { color: colors.white },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
