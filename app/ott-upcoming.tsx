import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { IconButton } from '@/components/buttons/IconButton';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { spacing } from '@/theme';

export default function UpcomingOttScreen() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.header}>
        <IconButton name="arrow-back" label="Go back" onPress={() => router.back()} />
        <View style={styles.titleCopy}>
          <AppText variant="caption" style={styles.eyebrow}>INDIA · VERIFIED</AppText>
          <AppText variant="heading1">Upcoming on OTT</AppText>
        </View>
      </View>
      <EmptyState
        icon="cloud-outline"
        title="Coming soon"
        message="Verified India OTT premieres are coming soon. Check back later."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  titleCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { letterSpacing: 2 },
});
