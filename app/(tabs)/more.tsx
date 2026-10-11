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

const groups: { title: string; rows: { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; route: string; hint: string }[] }[] = [
  { title: 'PREFERENCES', rows: [{ label: 'Notifications', detail: 'Reminders', icon: 'notifications-outline', route: '/settings/notifications', hint: 'Open Notification settings' }] },
  { title: 'LIBRARY', rows: [{ label: 'Favorites', detail: 'Your favorite titles', icon: 'heart-outline', route: '/favorites', hint: 'Open Favorites' }, { label: 'Upcoming', detail: 'Future movies, series and anime', icon: 'calendar-outline', route: '/upcoming', hint: 'Open Upcoming releases' }] },
  { title: 'DISCOVER', rows: [{ label: 'Global Hits', detail: 'Monthly & yearly rankings', icon: 'globe-outline', route: '/global-hits', hint: 'Open Global Hits rankings' }, { label: 'IMDb Top 250', detail: 'Top-rated movies & series', icon: 'star-outline', route: '/imdb-top', hint: 'Open IMDb Top 250' }, { label: 'Upcoming on OTT', detail: 'Coming soon', icon: 'cloud-outline', route: '/ott-upcoming', hint: 'Open Upcoming on OTT' }, { label: 'New Releases', detail: 'Fresh movies and shows', icon: 'sparkles-outline', route: '/new-releases', hint: 'Open New Releases' }, { label: 'Top 100', detail: 'The highest-rated titles', icon: 'trophy-outline', route: '/top-100', hint: 'Open Top 100' }] },
  { title: 'ABOUT', rows: [{ label: 'About Watch Later', detail: 'A little about this app', icon: 'information-circle-outline', route: '/about', hint: 'Open About Watch Later' }, { label: 'Privacy & terms', detail: 'Your data, your choice', icon: 'shield-checkmark-outline', route: '/privacy', hint: 'Open Privacy and Terms' }] },
];

export default function MoreScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const sync = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const account = new SupabaseAuthService();
  const statusLabel = sync.status === 'synced' ? 'Synced' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'pending' ? 'Changes pending' : sync.status === 'offline' ? 'Offline' : sync.status === 'error' ? 'Sync needs attention' : 'Ready to sync';

  async function syncNow() {
    if (session.mode !== 'authenticated' || busy) return;
    setBusy(true);
    try { await syncService.sync(session.userId); }
    catch { /* sync state already contains a safe user-facing message */ }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try {
      await account.signOut();
      const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
      setSession(guest);
      await persistSession(guest, onboardingComplete);
    } catch { void showDialog({ type: 'error', title: 'Couldn’t sign out', message: 'Your local library is unchanged. Please try again.' }); }
    finally { setBusy(false); }
  }

  async function confirmDeleteAccount() {
    if (session.mode !== 'authenticated' || busy) return;
    setDeleteOpen(false);
    setBusy(true);
    try {
      const { authDeleted } = await deleteAccount(session.userId);
      const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
      setSession(guest);
      await persistSession(guest, onboardingComplete);
      if (authDeleted) {
        showToast('Your account and all its data were deleted', 'success');
      } else {
        // Data is gone and you're signed out — but the sign-in itself
        // survived because the server step isn't deployed yet.
        void showDialog({
          type: 'warning',
          title: 'Data deleted, sign-in remains',
          message: 'Your library and data were deleted and you were signed out. The email sign-in itself still exists — deploy the delete-account function (see DEVELOPMENT.md) or remove the user in the Supabase dashboard so it can’t sign in again.',
        });
      }
    } catch (cause) {
      void showDialog({ type: 'error', title: 'Couldn’t delete your account', message: cause instanceof Error ? cause.message : 'Your data is unchanged. Please try again.' });
    } finally { setBusy(false); }
  }
  return <Screen scroll><View style={styles.top}><AppText variant="heading1">More</AppText><AppText variant="bodySmall" muted>Your Watch Later space</AppText></View>
    <View style={styles.profile}><View style={styles.avatar}><Ionicons name="person-outline" size={22} color={colors.accent} /></View><View style={styles.profileCopy}><AppText variant="heading3">{session.mode === 'authenticated' ? session.email || 'Your account' : 'Guest profile'}</AppText><AppText variant="caption" muted>{session.mode === 'authenticated' ? statusLabel : 'Your collection stays on this device'}</AppText></View><Ionicons name={session.mode === 'authenticated' ? 'cloud-done-outline' : 'phone-portrait-outline'} size={18} color={colors.textMuted} /></View>
    {groups.map((group) => <View key={group.title} style={styles.group}><AppText variant="caption" style={styles.groupTitle}>{group.title}</AppText><View style={styles.groupCard}>{group.rows.map((row) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}, ${row.detail}`} accessibilityHint={row.hint} onPress={() => router.push(row.route as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name={row.icon} size={20} color={colors.textSecondary} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{row.label}</AppText><AppText variant="caption" muted>{row.detail}</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable>)}</View></View>)}
    <View style={styles.group}><AppText variant="caption" style={styles.groupTitle}>ACCOUNT</AppText><View style={styles.groupCard}>{session.mode === 'authenticated' ? <><View style={styles.row}><Ionicons name="sync-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{statusLabel}</AppText><AppText variant="caption" muted>{sync.message ?? (sync.lastSyncedAt ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : 'Your library stays available offline')}</AppText></View></View><View style={styles.actions}><AppButton label="Sync now" onPress={() => void syncNow()} loading={busy || sync.status === 'syncing'} variant="secondary" /><AppButton label="Sign out" onPress={() => void signOut()} disabled={busy} variant="ghost" /><Pressable accessibilityRole="button" accessibilityLabel="Delete your account and all its data" accessibilityHint="Requires typing your email to confirm" onPress={() => setDeleteOpen(true)} disabled={busy} style={styles.deleteRow}><Ionicons name="trash-outline" size={20} color={colors.error} /><View style={styles.rowCopy}><AppText variant="bodyMedium" style={styles.deleteText}>Delete account</AppText><AppText variant="caption" muted>Removes your data everywhere</AppText></View></Pressable></View><DeleteAccountDialog visible={deleteOpen} email={session.mode === 'authenticated' ? session.email : ''} busy={busy} onClose={() => setDeleteOpen(false)} onConfirm={() => void confirmDeleteAccount()} /></> : <><Pressable accessibilityRole="button" accessibilityLabel="Sign in to sync your collection" onPress={() => router.push('/(auth)/login')} style={styles.row}><Ionicons name="log-in-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Sign in</AppText><AppText variant="caption" muted>Sync your collection across devices</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Create an account and sync your collection" onPress={() => router.push('/(auth)/create-account')} style={styles.row}><Ionicons name="person-add-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Create account</AppText><AppText variant="caption" muted>Keep your watchlist with you</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable></>}</View></View>
    <AppText variant="caption" muted style={styles.version}>WATCH LATER · VERSION 1.0</AppText>
  </Screen>;
}
const styles = StyleSheet.create({ top: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs }, profile: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }, profileCopy: { flex: 1, gap: 2 }, group: { marginBottom: spacing.xl }, groupTitle: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm, marginLeft: spacing.xs }, groupCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowCopy: { flex: 1, gap: 2 }, actions: { gap: spacing.xs, padding: spacing.md }, deleteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66 }, deleteText: { color: colors.error }, pressed: { backgroundColor: colors.surfaceElevated }, version: { textAlign: 'center', paddingBottom: spacing.xl, letterSpacing: 0.8 } });
