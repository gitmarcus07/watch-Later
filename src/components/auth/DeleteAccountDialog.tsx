import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, View } from 'react-native';
import { DialogCard } from '@/components/feedback/AppDialog';
import { AppText } from '@/components/common/AppText';
import { isDeleteConfirmed } from '@/features/auth/deleteAccount';
import { colors, radius, spacing } from '@/theme';

/**
 * GitHub-style delete confirmation: explains that everything is deleted and
 * requires typing the account email before the destructive action arms.
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
              message: `This permanently deletes your watchlist, watched history, favorites, ratings — everything tied to ${email || 'your account'} — from this device and our servers. This cannot be undone.`,
              primaryAction: { label: busy ? 'Deleting…' : 'Delete my account', destructive: true },
              secondaryAction: { label: 'Cancel' },
            }}
            content={
              <View style={styles.confirmBox}>
                <AppText variant="caption" muted style={styles.confirmHint}>
                  To confirm, type your email address below:
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
                {phrase.length > 0 && !matched ? (
                  <AppText variant="caption" style={styles.mismatch}>That doesn’t match your email yet.</AppText>
                ) : null}
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
  confirmBox: { width: '100%', gap: spacing.xs },
  confirmHint: { textAlign: 'center' },
  confirmEmail: { textAlign: 'center', color: colors.textPrimary },
  input: { minHeight: 52, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, paddingHorizontal: spacing.lg, fontSize: 16, marginTop: spacing.xs },
  inputMatched: { borderColor: colors.error },
  mismatch: { color: colors.error, textAlign: 'center' },
});
