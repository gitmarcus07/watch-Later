import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/feedback/FeedbackViews';
import { spacing } from '@/theme';

export default function UpcomingOttScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="caption" style={styles.eyebrow}>INDIA · VERIFIED</AppText>
        <AppText variant="heading1">Upcoming on OTT</AppText>
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
  header: { paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  eyebrow: { letterSpacing: 2 },
});
