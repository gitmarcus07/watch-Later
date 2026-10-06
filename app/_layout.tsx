import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { queryClient } from '@/lib/query/queryClient';
import { colors } from '@/theme';
import { logger } from '@/lib/logger';
import { hydrateSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { SqliteDatabaseRepository } from '@/data/local/repositories/SqliteDatabaseRepository';
import { LoadingView } from '@/components/feedback/FeedbackViews';

const database = new SqliteDatabaseRepository();

export default function RootLayout() {
  const hydrated = useSessionStore((state) => state.hasHydrated);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [startupError, setStartupError] = useState(false);

  useEffect(() => {
    void hydrateSession();
    void database.initialize().then(() => setDatabaseReady(true)).catch((error: unknown) => {
      logger.error('Database startup failed', error);
      setStartupError(true);
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.resumePausedMutations();
    });
    return () => subscription.remove();
  }, []);

  if (!hydrated || (!databaseReady && !startupError)) {
    return <SafeAreaProvider><View style={styles.startup}><StatusBar style="light" /><LoadingView label="Getting things ready" /></View></SafeAreaProvider>;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(onboarding)/welcome" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)/login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="(auth)/create-account" options={{ presentation: 'modal' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, startup: { flex: 1, backgroundColor: colors.background } });
