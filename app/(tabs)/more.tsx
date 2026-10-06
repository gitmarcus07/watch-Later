import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { colors, radius, spacing } from '@/theme';
import { useSessionStore } from '@/store/app/sessionStore';
import { useSyncStore } from '@/store/app/syncStore';
import { SupabaseAuthService } from '@/features/auth/SupabaseAuthService';
import { syncService } from '@/features/sync/SyncService';
import { persistSession } from '@/store/app/sessionPersistence';
import { AppButton } from '@/components/buttons/AppButton';

const groups = [
  { title: 'PREFERENCES', rows: [{ label: 'Appearance', detail: 'Dark cinematic', icon: 'contrast-outline' }, { label: 'Notifications', detail: 'Coming soon', icon: 'notifications-outline' }] },
  { title: 'LIBRARY', rows: [{ label: 'Lists', detail: 'Your curated collections', icon: 'list-outline' }, { label: 'Favorites', detail: 'Your favorite titles', icon: 'heart-outline' }, { label: 'History', detail: 'Recently viewed', icon: 'time-outline' }] },
  { title: 'ABOUT', rows: [{ label: 'About Watch Later', detail: 'A little about this app', icon: 'information-circle-outline' }, { label: 'Privacy & terms', detail: 'Your data, your choice', icon: 'shield-checkmark-outline' }] },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const onboardingComplete = useSessionStore((state) => state.onboardingComplete);
  const sync = useSyncStore();
  const [busy, setBusy] = useState(false);
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
    } catch { Alert.alert('Couldn’t sign out', 'Your local library is unchanged. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Screen scroll><View style={styles.top}><AppText variant="heading1">More</AppText><AppText variant="bodySmall" muted>Your Watch Later space</AppText></View>
    <View style={styles.profile}><View style={styles.avatar}><Ionicons name="person-outline" size={22} color={colors.accent} /></View><View style={styles.profileCopy}><AppText variant="heading3">{session.mode === 'authenticated' ? session.email || 'Your account' : 'Guest profile'}</AppText><AppText variant="caption" muted>{session.mode === 'authenticated' ? statusLabel : 'Your collection stays on this device'}</AppText></View><Ionicons name={session.mode === 'authenticated' ? 'cloud-done-outline' : 'phone-portrait-outline'} size={18} color={colors.textMuted} /></View>
    {groups.map((group) => <View key={group.title} style={styles.group}><AppText variant="caption" style={styles.groupTitle}>{group.title}</AppText><View style={styles.groupCard}>{group.rows.map((row) => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={`${row.label}, ${row.detail}`} onPress={() => undefined} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Ionicons name={row.icon} size={20} color={colors.textSecondary} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{row.label}</AppText><AppText variant="caption" muted>{row.detail}</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable>)}</View></View>)}
    <View style={styles.group}><AppText variant="caption" style={styles.groupTitle}>ACCOUNT</AppText><View style={styles.groupCard}>{session.mode === 'authenticated' ? <><View style={styles.row}><Ionicons name="sync-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">{statusLabel}</AppText><AppText variant="caption" muted>{sync.message ?? (sync.lastSyncedAt ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : 'Your library stays available offline')}</AppText></View></View><View style={styles.actions}><AppButton label="Sync now" onPress={() => void syncNow()} loading={busy || sync.status === 'syncing'} variant="secondary" /><AppButton label="Sign out" onPress={() => void signOut()} disabled={busy} variant="ghost" /></View></> : <><Pressable accessibilityRole="button" accessibilityLabel="Sign in to sync your collection" onPress={() => router.push('/(auth)/login')} style={styles.row}><Ionicons name="log-in-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Sign in</AppText><AppText variant="caption" muted>Sync your collection across devices</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Create an account and sync your collection" onPress={() => router.push('/(auth)/create-account')} style={styles.row}><Ionicons name="person-add-outline" size={20} color={colors.accent} /><View style={styles.rowCopy}><AppText variant="bodyMedium">Create account</AppText><AppText variant="caption" muted>Keep your watchlist with you</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted} /></Pressable></>}</View></View>
    <AppText variant="caption" muted style={styles.version}>WATCH LATER · VERSION 1.0</AppText>
  </Screen>;
}
const styles = StyleSheet.create({ top: { paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs }, profile: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }, profileCopy: { flex: 1, gap: 2 }, group: { marginBottom: spacing.xl }, groupTitle: { color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm, marginLeft: spacing.xs }, groupCard: { backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, rowCopy: { flex: 1, gap: 2 }, actions: { gap: spacing.xs, padding: spacing.md }, pressed: { backgroundColor: colors.surfaceElevated }, version: { textAlign: 'center', paddingBottom: spacing.xl, letterSpacing: 0.8 } });
