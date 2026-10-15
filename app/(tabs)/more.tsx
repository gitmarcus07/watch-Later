import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { DeleteAccountDialog } from '@/components/auth/DeleteAccountDialog';
import { deleteAccount } from '@/features/auth/deleteAccount';
import { colors, radius, spacing } from '@/theme';
import { useSessionStore } from '@/store/app/sessionStore';
import { useSyncStore } from '@/store/app/syncStore';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { syncService } from '@/features/sync/SyncService';
import { persistSession } from '@/store/app/sessionPersistence';
import { AppButton } from '@/components/buttons/AppButton';
import type { SyncStatus } from '@/domain/models/sync';

const groups: { title: string; rows: { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; route: string; hint: string }[] }[] = [
  { title: 'PREFERENCES', rows: [{ label: 'Notifications', detail: 'Reminders', icon: 'notifications-outline', route: '/settings/notifications', hint: 'Open Notification settings' }] },
  { title: 'LIBRARY', rows: [{ label: 'Favorites', detail: 'Your favorite titles', icon: 'heart-outline', route: '/favorites', hint: 'Open Favorites' }] },
  { title: 'DISCOVER', rows: [{ label: 'Franchise Collections', detail: 'Movies & shows in order', icon: 'albums-outline', route: '/franchises', hint: 'Open franchise collections' }, { label: 'Global Hits', detail: 'Coming soon', icon: 'globe-outline', route: '/global-hits', hint: 'Open Global Hits rankings' }, { label: 'Top 250', detail: 'Top-rated movies & series', icon: 'star-outline', route: '/imdb-top', hint: 'Open Top 250' }, { label: 'Upcoming on OTT', detail: 'Coming soon', icon: 'cloud-outline', route: '/ott-upcoming', hint: 'Open Upcoming on OTT' }, { label: 'New Releases', detail: 'Fresh movies and shows', icon: 'sparkles-outline', route: '/new-releases', hint: 'Open New Releases' }, { label: 'Top 100', detail: 'The highest-rated titles', icon: 'trophy-outline', route: '/top-100', hint: 'Open Top 100' }] },
  { title: 'ABOUT', rows: [{ label: 'About Watch Later', detail: 'A little about this app', icon: 'information-circle-outline', route: '/about', hint: 'Open About Watch Later' }, { label: 'Privacy & terms', detail: 'Your data, your choice', icon: 'shield-checkmark-outline', route: '/privacy', hint: 'Open Privacy and Terms' }] },
];

/** Human "12 min ago" style label for the last successful sync. */
function formatRelative(iso?: string): string | undefined {
  if (!iso) return undefined;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

interface StatusMeta { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; detail: string }

function statusMetaFor(status: SyncStatus, message?: string, lastSyncedAt?: string): StatusMeta {
  const lastSynced = formatRelative(lastSyncedAt);
  switch (status) {
    case 'synced':
      return { label: 'Synced', icon: 'cloud-done-outline', color: colors.success, detail: lastSynced ? `Last synced ${lastSynced}` : 'Your library is up to date' };
    case 'syncing':
      return { label: 'Syncing…', icon: 'sync-outline', color: colors.accent, detail: 'Sending your latest changes' };
    case 'pending':
      return { label: 'Changes pending', icon: 'time-outline', color: colors.warning, detail: message ?? 'We’ll retry automatically' };
    case 'offline':
      return { label: 'Waiting to sync', icon: 'cloud-offline-outline', color: colors.textMuted, detail: message ?? (lastSynced ? `Last synced ${lastSynced} — we’ll sync when you’re back online` : 'We’ll sync as soon as you’re back online') };
    case 'error':
      return { label: 'Sync needs attention', icon: 'alert-circle-outline', color: colors.error, detail: message ?? 'Try again, or sign out and back in' };
    default:
      return { label: 'Ready to sync', icon: 'cloud-outline', color: colors.textMuted, detail: 'Your library syncs automatically' };
  }
}

function initialsFor(email: string): string {
  const letters = email.replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || 'U').toUpperCase();
}

export default function MoreScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const sync = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const account = new SupabaseAuthService();
  const status = statusMetaFor(sync.status, sync.message, sync.lastSyncedAt);
  const retryLabel = sync.status === 'offline' || sync.status === 'error';

  async function syncNow() {
    if (session.mode !== 'authenticated' || busy) return;
    setBusy(true);
    try {
      await syncService.sync(session.userId);
      showToast('Your library is up to date', 'success');
    } catch { /* sync state already contains a safe user-facing message */ }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (busy) return;
    const confirmed = await showDialog({
      type: 'info',
      title: 'Sign out?',
      message: 'You can sign back in anytime — your library stays safe in your account.',
      primaryAction: { label: 'Sign out' },
      secondaryAction: { label: 'Cancel' },
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await account.signOut();
      const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
      setSession(guest);
      await persistSession(guest, onboardingComplete);
      useSyncStore.getState().reset();
    } catch { void showDialog({ type: 'error', title: 'Couldn’t sign out', message: 'Your local library is unchanged. Please try again.' }); }
    finally { setBusy(false); }
  }

  async function confirmDeleteAccount() {
    if (session.mode !== 'authenticated' || busy) return;
    setDeleteOpen(false);
    setBusy(true);
    try {
      await deleteAccount(session.userId);
      const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
      setSession(guest);
      await persistSession(guest, onboardingComplete);
      useSyncStore.getState().reset();
      showToast('Your account and all its data were deleted', 'success');
    } catch (cause) {
      void showDialog({ type: 'error', title: 'Couldn’t delete your account', message: cause instanceof Error ? cause.message : 'Your data is unchanged. Please try again.' });
    } finally { setBusy(false); }
  }
  return <Screen scroll><View style={styles.top}><AppText variant="heading1">More</AppText><AppText variant="bodySmall" muted>Your Watch Later space</AppText></View>
    <View style={styles.profile}>
      <View style={styles.avatar}><AppText variant="heading3" style={styles.avatarText}>{session.mode === 'authenticated' ? initialsFor(session.email) : 'G'}</AppText></View>
      <View style={styles.profileCopy}>
        <AppText variant="heading3">{session.mode === 'authenticated' ? session.email || 'Your account' : 'Guest profile'}</AppText>
        {session.mode === 'authenticated'
          ? <View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: status.color }]} /><AppText variant="caption" muted>{status.label}</AppText></View>
          : <AppText variant="caption" muted>Your collection stays on this device</AppText>}
      </View>
      <Ionicons name={session.mode === 'authenticated' ? status.icon : 'phone-portrait-outline'} size={20} color={session.mode === 'authenticated' ? status.color : colors.textMuted} />
    </View>
    {groups.map((group) => <View key={group.title} style={styles.group}><AppText variant="caption" style={styles.groupTitle}>{group.title}</AppText><View style={styles.groupCard}>{group.rows.map((row) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}, ${row.detail}`} accessibilityHint={row.hint} onPress={() => router.push(row.route as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name={row.icon} size={20} color={colors.textSecondary} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{row.label}</AppText><AppText variant="caption" muted>{row.detail}</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable>)}</View></View>)}
    <View style={styles.group}><AppText variant="caption" style={styles.groupTitle}>ACCOUNT</AppText><View style={styles.groupCard}>{session.mode === 'authenticated' ? <><View style={styles.row}><Ionicons name={status.icon} size={20} color={status.color} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{status.label}</AppText><AppText variant="caption" muted>{status.detail}</AppText></View></View><View style={styles.actions}><AppButton label={retryLabel ? 'Try again' : 'Sync now'} onPress={() => void syncNow()} loading={busy || sync.status === 'syncing'} variant="secondary" icon={<Ionicons name="sync-outline" size={17} color={colors.textPrimary} />} /><AppButton label="Sign out" onPress={() => void signOut()} disabled={busy} variant="ghost" icon={<Ionicons name="log-out-outline" size={17} color={colors.textSecondary} />} /><Pressable accessibilityRole="button" accessibilityLabel="Delete your account and all its data" accessibilityHint="Requires typing your email to confirm" onPress={() => setDeleteOpen(true)} disabled={busy} style={styles.deleteRow}><Ionicons name="trash-outline" size={20} color={colors.error} /><View style={styles.rowCopy}><AppText variant="bodyMedium" style={styles.deleteText}>Delete account</AppText><AppText variant="caption" muted>Removes your data everywhere</AppText></View></Pressable></View><DeleteAccountDialog visible={deleteOpen} email={session.mode === 'authenticated' ? session.email : ''} busy={busy} onClose={() => setDeleteOpen(false)} onConfirm={() => void confirmDeleteAccount()} /></> : <><Pressable accessibilityRole="button" accessibilityLabel="Sign in to sync your collection" onPress={() => router.push('/(auth)/login')} style={styles.row}><Ionicons name="log-in-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Sign in</AppText><AppText variant="caption" muted>Sync your collection across devices</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Create an account to keep your library" onPress={() => router.push('/(auth)/create-account')} style={styles.row}><Ionicons name="person-add-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Create account</AppText><AppText variant="caption" muted>Keep your watchlist with you</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable></>}</View></View>
    <AppText variant="caption" muted style={styles.version}>WATCH LATER · VERSION 1.0</AppText>
  </Screen>;
}
const styles = StyleSheet.create({ top: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs }, profile: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, avatarText: { color: colors.accent, letterSpacing: 0.5 }, profileCopy: { flex: 1, gap: 4 }, statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, statusDot: { width: 7, height: 7, borderRadius: 4 }, group: { marginBottom: spacing.xl }, groupTitle: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm, marginLeft: spacing.xs }, groupCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowCopy: { flex: 1, gap: 2 }, actions: { gap: spacing.xs, padding: spacing.md }, deleteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66 }, deleteText: { color: colors.error }, pressed: { backgroundColor: colors.surfaceElevated }, version: { textAlign: 'center', paddingBottom: spacing.xl, letterSpacing: 0.8 } });
