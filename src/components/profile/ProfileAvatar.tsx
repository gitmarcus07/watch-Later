import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/common/AppText';
import { useSessionStore } from '@/store/app/sessionStore';
import { colors } from '@/theme';

const AVATAR_SIZE = 46;

/**
 * Read-only auth mirror for the home header. Display-only: a plain View,
 * never a button. Guest users see the person icon; signed-in users see
 * their photo when one is available, otherwise their initial.
 */
export function ProfileAvatar({ photoUrl, size = AVATAR_SIZE }: { photoUrl?: string; size?: number }) {
  const session = useSessionStore((state) => state.session);
  const [photoFailed, setPhotoFailed] = useState(false);
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (session.mode !== 'authenticated') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel="Guest profile" style={[styles.circle, dimension]}>
        <Ionicons name="person-outline" size={20} color={colors.accent} />
      </View>
    );
  }

  const initial = (session.email.trim()[0] ?? '?').toUpperCase();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Your profile picture" style={[styles.circle, styles.signedIn, dimension]}>
      {photoUrl && !photoFailed ? (
        <Image source={{ uri: photoUrl }} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} resizeMode="cover" onError={() => setPhotoFailed(true)} />
      ) : (
        <AppText variant="heading3" style={styles.initial}>{initial}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  signedIn: { backgroundColor: 'rgba(182,156,255,0.16)', borderColor: colors.accent },
  initial: { color: colors.accent },
});
