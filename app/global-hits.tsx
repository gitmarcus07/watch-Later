import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { spacing } from '@/theme';

/**
 * Placeholder. The published-report pipeline behind Global Hits is not live yet,
 * so the menu entry stays reachable but the screen says so plainly instead of
 * showing a half-populated grid. The ranking UI itself lives in
 * components/hits/HitsGrid and is covered by tests/globalHitsUI.test.tsx — when
 * the pipeline ships, swap this EmptyState back for that grid.
 */
export default function GlobalHitsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.header}>
        <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
        <View style={styles.titleCopy}>
          <AppText variant="heading1">Global Hits</AppText>
        </View>
      </View>
      <EmptyState
        icon="globe-outline"
        title="Coming soon"
        message="Monthly and yearly rankings are on the way. Check back soon."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  titleCopy: { flex: 1, gap: 2 },
});
