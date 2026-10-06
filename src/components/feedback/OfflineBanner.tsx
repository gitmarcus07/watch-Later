import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { useSyncStore } from '@/store/app/syncStore';
import { colors, radius, spacing } from '@/theme';

export function useIsOffline(): boolean {
  const syncStatus = useSyncStore((state) => state.status);
  const [unreachable, setUnreachable] = useState(false);
  useEffect(() => NetInfo.addEventListener((state) => setUnreachable(state.isConnected === false)), []);
  return unreachable || syncStatus === 'offline';
}

/** Subtle offline indicator. Never blocks local use; sync retries automatically. */
export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel="You are offline. Local changes are safe and will sync later.">
      <Ionicons name="cloud-offline-outline" size={15} color={colors.accent} />
      <AppText variant="caption" style={styles.text}>Offline — changes stay on this device and sync later</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    marginTop: spacing.sm, alignSelf: 'center',
  },
  text: { color: colors.textSecondary },
});
