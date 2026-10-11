import { useCallback, useEffect, useState } from 'react';
import { openURL } from 'expo-linking';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import type { CatalogMedia, WatchProviderGroup } from '@/domain/models/media';
import type { OttReleaseRecord, OttReleaseStatus } from '@/domain/models/ottRelease';
import { useOttForMedia } from '@/features/ott/hooks';
import { getOttNotifyPref, ottPreviewContent, sendTestNotification, setOttReminder } from '@/features/ott/ottReminders';
import {
  OTT_STATUS_LABELS,
  formatOttDate,
  formatTheatricalDate,
  formatVerificationDate,
  isStaleVerification,
  ottStatusBadge,
} from '@/features/ott/ottLabels';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { colors, radius, spacing } from '@/theme';

const BADGE_COLORS: Record<OttReleaseStatus, string> = {
  confirmed: colors.success,
  expected: colors.accent,
  window_announced: colors.warning,
  platform_announced: colors.textSecondary,
  unannounced: colors.textMuted,
  released: colors.success,
};

function PlatformMark({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[styles.logo, styles.logoFallback]}>
      <AppText variant="caption" style={styles.logoText}>{name.slice(0, 2).toUpperCase()}</AppText>
    </View>
  );
}

function RecordCard({ record, mediaId }: { record: OttReleaseRecord; mediaId: string }) {
  const [notifyOn, setNotifyOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const dateLabel = formatOttDate(record.ottReleaseDate, record.datePrecision);
  const theatricalLabel = formatTheatricalDate(record.theatricalReleaseDate);
  const stale = isStaleVerification(record);

  useEffect(() => {
    let active = true;
    void getOttNotifyPref(record.id).then((value) => { if (active) setNotifyOn(value); });
    return () => { active = false; };
  }, [record.id]);

  const toggle = useCallback(async (value: boolean) => {
    setBusy(true);
    try {
      const result = await setOttReminder(record, value);
      setNotifyOn(value);
      if (result.status === 'scheduled') showToast('You’ll be notified on premiere day', 'success');
      else if (result.status === 'saved') showToast('Saved — we’ll notify you when a date is announced', 'info');
      else if (result.status === 'off') showToast('OTT reminder turned off', 'info');
      else if (result.status === 'denied') {
        void showDialog({
          type: 'warning',
          title: 'Notifications are blocked',
          message: 'Your preference is saved, but alerts can’t appear until notifications are allowed in system settings.',
        });
      } else {
        void showDialog({ type: 'error', title: 'Couldn’t update the reminder', message: 'Your preference is saved on this device. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  }, [record]);

  const preview = useCallback(async () => {
    const result = await sendTestNotification(ottPreviewContent(record));
    if (result === 'scheduled') showToast('Preview arrives in ~10 seconds', 'success');
    else if (result === 'denied') {
      void showDialog({ type: 'warning', title: 'Notifications are blocked', message: 'Allow notifications in system settings, then try again.' });
    } else {
      void showDialog({ type: 'error', title: 'Couldn’t schedule the preview', message: 'Please try again.' });
    }
  }, [record]);

  return (
    <View style={styles.card} accessibilityRole="text" accessibilityLabel={`${record.platform}, ${OTT_STATUS_LABELS[record.status]}${dateLabel ? `, ${dateLabel}` : ''}`}>
      <View style={styles.cardTop}>
        <PlatformMark name={record.platform} logoUrl={record.platformLogoUrl} />
        <View style={styles.cardTitle}>
          <AppText variant="bodyMedium" style={styles.platform}>{record.platform}</AppText>
          {!record.isPremiere ? <AppText variant="caption" muted>Additional availability</AppText> : null}
        </View>
        <View style={[styles.badge, { borderColor: BADGE_COLORS[record.status] }]}>
          <AppText variant="caption" style={{ color: BADGE_COLORS[record.status] }}>{ottStatusBadge(record.status)}</AppText>
        </View>
      </View>
      <AppText variant="bodySmall" style={styles.statusLine}>{OTT_STATUS_LABELS[record.status]}</AppText>
      {dateLabel ? <AppText variant="heading3" style={styles.date}>{dateLabel}</AppText> : null}
      {theatricalLabel ? <AppText variant="caption" muted>In theatres {theatricalLabel}</AppText> : null}
      {record.notes ? <AppText variant="caption" muted style={styles.notes}>{record.notes}</AppText> : null}
      <AppText variant="caption" muted style={styles.verified}>
        Verified {formatVerificationDate(record.lastVerifiedAt)}{stale ? ' · may be outdated' : ''}
      </AppText>
      <View style={styles.cardActions}>
        {record.sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open official announcement for ${record.platform}`}
            accessibilityHint={mediaId}
            onPress={() => void openURL(record.sourceUrl!).catch((error: unknown) => showDialog({ type: 'error', title: 'Couldn’t open the source', message: friendlyErrorMessage(error) }))}
            style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
          >
            <Ionicons name="open-outline" size={15} color={colors.accent} />
            <AppText variant="bodySmall" style={styles.sourceText}>Official announcement</AppText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Preview the premiere alert for ${record.movieTitle}`}
          onPress={() => void preview()}
          style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
        >
          <Ionicons name="notifications-outline" size={15} color={colors.accent} />
          <AppText variant="bodySmall" style={styles.sourceText}>Preview alert</AppText>
        </Pressable>
        <View style={styles.reminderRow}>
          <AppText variant="caption" muted>Notify me</AppText>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={`Notify me when ${record.movieTitle} arrives on ${record.platform}`}
            accessibilityState={{ checked: notifyOn }}
            value={notifyOn}
            disabled={busy}
            onValueChange={(value) => void toggle(value)}
            trackColor={{ true: colors.accent, false: colors.surfaceElevated }}
            thumbColor={colors.white}
          />
        </View>
      </View>
    </View>
  );
}

function LiveAvailabilityCard({ groups }: { groups: WatchProviderGroup[] }) {
  const stream = groups.find((group) => group.category === 'stream');
  if (!stream) return null;
  return (
    <View style={styles.card} accessibilityRole="text" accessibilityLabel={`Streaming now in India on ${stream.providers.map((provider) => provider.name).join(', ')}`}>
      <View style={styles.cardTop}>
        <View style={styles.liveDot} />
        <View style={styles.cardTitle}>
          <AppText variant="bodyMedium" style={styles.platform}>Streaming now in India</AppText>
          <AppText variant="caption" muted>Live availability · not a premiere announcement</AppText>
        </View>
      </View>
      <View style={styles.providerRow}>
        {stream.providers.slice(0, 6).map((provider) => (
          <View key={provider.id} style={styles.provider} accessibilityRole="image" accessibilityLabel={provider.name}>
            {provider.logoUrl ? <Image source={{ uri: provider.logoUrl }} style={styles.providerLogo} resizeMode="cover" /> : <AppText variant="caption">{provider.name.slice(0, 2).toUpperCase()}</AppText>}
          </View>
        ))}
      </View>
      <AppText variant="caption" muted>{stream.providers.slice(0, 6).map((provider) => provider.name).join(' · ')}</AppText>
    </View>
  );
}

/**
 * OTT Release section for the media details screen (India). Verified
 * announcements render with precision-aware dates; live TMDB `IN`
 * availability is shown separately and never as a premiere date.
 */
export function OttReleaseSection({ media }: { media: CatalogMedia }) {
  const ott = useOttForMedia(media);
  const records = ott.data?.records ?? [];
  const streaming = ott.data?.indiaStreaming ?? [];

  return (
    <View style={styles.section} accessibilityRole="text" accessibilityLabel="OTT release details for India">
      <AppText variant="heading3">OTT Release · India</AppText>
      {ott.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <AppText variant="caption" muted>Checking verified OTT announcements…</AppText>
        </View>
      ) : ott.isError && !records.length && !streaming.length ? (
        <View style={styles.mutedCard}>
          <AppText variant="bodySmall" muted>{ott.data?.loadError ?? 'Verified OTT details could not be loaded.'}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry loading OTT details" onPress={() => void ott.refetch()} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
            <AppText variant="bodySmall" style={styles.sourceText}>Try again</AppText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cards}>
          {records.map((record) => <RecordCard key={record.id} record={record} mediaId={media.id} />)}
          <LiveAvailabilityCard groups={streaming} />
          {!records.length && !streaming.find((group) => group.category === 'stream') ? (
            <View style={styles.mutedCard}>
              <Ionicons name="cloud-outline" size={19} color={colors.textMuted} />
              <AppText variant="bodySmall" muted style={styles.mutedText}>OTT release details not announced yet</AppText>
            </View>
          ) : null}
          {ott.data?.source === 'cache' ? <AppText variant="caption" muted>Offline — showing last verified data.</AppText> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing['2xl'], gap: spacing.md },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  cards: { gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { flex: 1, gap: 2 },
  platform: { color: colors.white },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  logoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  logoText: { color: colors.accent },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusLine: { color: colors.textSecondary },
  date: { color: colors.white },
  notes: { lineHeight: 20 },
  verified: { marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.md },
  sourceButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  sourceText: { color: colors.accent },
  retry: { paddingVertical: spacing.sm },
  pressed: { opacity: 0.7 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mutedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  mutedText: { flex: 1 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  providerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  provider: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  providerLogo: { width: 44, height: 44 },
});
