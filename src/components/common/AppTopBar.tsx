import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { colors, radius, spacing } from '@/theme';

export function AppTopBar({ title = 'WATCH LATER' }: { title?: string }) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Ionicons name="bookmark" size={14} color={colors.background} />
        </View>
        <AppText variant="label" style={styles.wordmark}>
          {title}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search catalog"
          accessibilityHint="Search movies, shows and anime"
          onPress={() => router.push('/search')}
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse catalog"
          accessibilityHint="Browse trending movies, shows, anime and more"
          onPress={() => router.push('/browse')}
          style={({ pressed }) => [styles.browse, pressed && styles.pressed]}
        >
          <Ionicons name="grid-outline" size={18} color={colors.accent} />
          <AppText variant="label" style={styles.browseText}>Browse</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { color: colors.white, letterSpacing: 2, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  icon: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  browse: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  browseText: { color: colors.textPrimary },
  pressed: { opacity: 0.7 },
});
