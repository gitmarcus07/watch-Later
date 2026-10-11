import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PosterCard } from '@/components/media/PosterCard';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import type { CatalogMedia } from '@/domain/models/media';
import { useInterestedMutation, useInterestedStatus } from '@/features/watchState/hooks';
import { setUpcomingReminder } from '@/features/notifications/upcomingReminders';
import { triggerLightHaptic, triggerSuccessHaptic } from '@/lib/haptics';
import { colors } from '@/theme';

/**
 * Upcoming poster with a notify-me bell. Tapping flips the interest mark
 * instantly and arms (or cancels) the branded release-day alert.
 */
export function UpcomingCard({ media, subtitle, width, onOpen }: {
  media: CatalogMedia;
  subtitle: string;
  width: number;
  onOpen: () => void;
}) {
  const identity = { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId } as const;
  const status = useInterestedStatus(identity);
  const mutation = useInterestedMutation(media, status.data ?? false);
  const active = status.data ?? false;

  async function toggle() {
    if (mutation.isPending) return;
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
            void showDialog({ type: 'error', title: 'Couldn’t set the reminder', message: 'Your interest is saved. Please try the reminder again later.' });
          } else {
            showToast('Release reminder removed', 'info');
          }
        });
      },
    });
  }

  return (
    <View style={[styles.wrap, { width }]}>
      <PosterCard title={media.title} subtitle={subtitle} posterUri={media.posterUrl} width={width} onPress={onOpen} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? `Stop notifying about ${media.title}` : `Notify me about ${media.title}`}
        accessibilityState={{ selected: active, busy: mutation.isPending, disabled: status.isLoading }}
        onPress={() => void toggle()}
        disabled={status.isLoading || mutation.isPending}
        style={({ pressed }) => [styles.bell, active && styles.bellActive, pressed && styles.pressed]}
      >
        {active
          ? <Ionicons name="notifications" size={15} color={colors.white} />
          : <Ionicons name="notifications-outline" size={15} color={colors.textSecondary} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  bell: {
    position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(10,10,12,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
});
