import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DialogCard } from '@/components/feedback/AppDialog';
import { AppText } from '@/components/common/AppText';
import { isDeleteConfirmed } from '@/features/auth/deleteAccount';
import { colors, radius, spacing } from '@/theme';

/**
 * GitHub-style delete confirmation: spells out exactly what disappears,
 * requires typing the account email before the destructive action arms,
 * and shows clear armed/mismatch feedback.
 */
export function DeleteAccountDialog({ visible, email, busy, onClose, onConfirm }: {
  visible: boolean;
  email: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of the confirmation input each time the dialog opens
    if (visible) setPhrase('');
  }, [visible]);
  const matched = isDeleteConfirmed(phrase, email);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.centered}>
          <DialogCard
            request={{
              type: 'error',
              title: 'Delete your account?',
              message: 'This permanently removes everything tied to your account — from this device and from our servers. It cannot be undone.',
              primaryAction: { label: busy ? 'Deleting…' : 'Delete my account', destructive: true },
              secondaryAction: { label: 'Cancel' },
            }}
            content={
              <View style={styles.confirmBox}>
                <View style={styles.bullets}>
                  {['Your watchlist and watched history', 'Favorites, ratings and progress', 'Sync data stored on our servers'].map((item) => (
                    <View key={item} style={styles.bulletRow}>
                      <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                      <AppText variant="caption" muted style={styles.bulletText}>{item}</AppText>
                    </View>
                  ))}
                </View>
                <AppText variant="caption" muted style={styles.confirmHint}>
                  To confirm, type your email address:
                </AppText>
                <AppText variant="label" style={styles.confirmEmail}>{email}</AppText>
                <TextInput
                  accessibilityLabel="Type your email to confirm deletion"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={phrase}
                  onChangeText={setPhrase}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textMuted}
                  selectionColor={colors.error}
                  editable={!busy}
                  style={[styles.input, matched && styles.inputMatched]}
                />
                {phrase.length === 0 ? null : matched
                  ? <AppText variant="caption" style={styles.matched}>Email matches — the delete button is ready.</AppText>
                  : <AppText variant="caption" style={styles.mismatch}>That doesn’t match your email yet.</AppText>}
              </View>
            }
            onPrimary={() => { if (matched && !busy) onConfirm(); }}
            onSecondary={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  centered: { width: '100%', maxWidth: 360 },
  confirmBox: { width: '100%', gap: spacing.sm },
  bullets: { width: '100%', gap: spacing.xs, backgroundColor: 'rgba(255,90,101,0.06)', borderRadius: radius.medium, borderWidth: 1, borderColor: 'rgba(255,90,101,0.18)', padding: spacing.md, marginBottom: spacing.xs },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bulletText: { flex: 1 },
  confirmHint: { textAlign: 'center' },
  confirmEmail: { textAlign: 'center', color: colors.textPrimary },
  input: { minHeight: 52, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, paddingHorizontal: spacing.lg, fontSize: 16 },
  inputMatched: { borderColor: colors.error },
  mismatch: { color: colors.error, textAlign: 'center' },
  matched: { color: colors.success, textAlign: 'center' },
});
