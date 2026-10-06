import { Component, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/buttons/AppButton';
import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { logger } from '@/lib/logger';
import { colors, radius, spacing } from '@/theme';

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level crash recovery. Catches unexpected rendering errors, shows a
 * polished recovery screen, and never deletes local SQLite data.
 */
export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    logger.error('Unhandled UI error captured by boundary', error);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <Screen>
        <View style={styles.container}>
          <View style={styles.icon}>
            <Ionicons name="alert-circle-outline" size={27} color={colors.accent} />
          </View>
          <AppText variant="heading2" style={styles.title} accessibilityRole="alert">
            Something went wrong
          </AppText>
          <AppText muted style={styles.message}>
            Watch Later ran into an unexpected problem. Your saved library and pending sync work are safe on this device.
          </AppText>
          <AppButton label="Try again" onPress={this.reset} />
        </View>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  icon: {
    width: 62, height: 62, borderRadius: radius.large, backgroundColor: colors.surfaceElevated,
    borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 300, lineHeight: 22 },
});
