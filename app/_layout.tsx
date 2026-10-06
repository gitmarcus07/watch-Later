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
import { hydrateSession, persistSession } from '@/store/app/sessionPersistence';
import { useSessionStore } from '@/store/app/sessionStore';
import { useAppearanceStore } from '@/store/app/appearanceStore';
import { useNotificationStore } from '@/store/app/notificationStore';
import { SqliteDatabaseRepository } from '@/data/local/repositories/SqliteDatabaseRepository';
import { LoadingView } from '@/components/feedback/FeedbackViews';
import { AppErrorBoundary } from '@/components/feedback/AppErrorBoundary';
import { DialogProvider } from '@/components/feedback/AppDialog';
import { supabase } from '@/data/remote/supabase/client';
import { handleAutoSyncForeground, scheduleAutoSync, startAutoSync } from '@/features/sync/autoSync';
import { watchStateSyncRepository } from '@/data/local/repositories/SqliteWatchStateRepository';

const database = new SqliteDatabaseRepository();

export default function RootLayout() {
  const hydrated = useSessionStore((state) => state.hasHydrated);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [startupError, setStartupError] = useState(false);

  useEffect(() => {
    void hydrateSession();
    void useAppearanceStore.getState().hydrate();
    void useNotificationStore.getState().hydrate();
    void database.initialize().then(() => setDatabaseReady(true)).catch((error: unknown) => {
      logger.error('Database startup failed', error);
      setStartupError(true);
    });
  }, []);

  useEffect(() => {
    const authClient = supabase;
    if (!authClient) return;
    const { data: subscription } = authClient.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const authenticated = { mode: 'authenticated' as const, userId: session.user.id, email: session.user.email ?? '' };
        setTimeout(() => {
          void watchStateSyncRepository.bindAccount(session.user.id).then(async () => {
            const current = useSessionStore.getState();
            current.setSession(authenticated);
            await persistSession(authenticated, current.onboardingComplete);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') scheduleAutoSync('auth');
          }).catch(async () => {
            await authClient.auth.signOut();
            const current = useSessionStore.getState();
            const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
            current.setSession(guest);
            await persistSession(guest, current.onboardingComplete);
          });
        }, 0);
      } else if (event === 'SIGNED_OUT' && useSessionStore.getState().session.mode === 'authenticated') {
        const current = useSessionStore.getState();
        const guest = { mode: 'guest' as const, userId: `guest-${Date.now()}` };
        current.setSession(guest);
        void persistSession(guest, current.onboardingComplete);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.resumePausedMutations();
        const session = useSessionStore.getState().session;
        if (session.mode === 'authenticated') handleAutoSyncForeground();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => startAutoSync(), []);

  if (!hydrated || (!databaseReady && !startupError)) {
    return <AppErrorBoundary><SafeAreaProvider><View style={styles.startup}><StatusBar style="light" /><LoadingView label="Getting things ready" /></View></SafeAreaProvider></AppErrorBoundary>;
  }

  return (
    <AppErrorBoundary>
    <GestureHandlerRootView style={styles.root}>
      <DialogProvider>
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
      </DialogProvider>
    </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, startup: { flex: 1, backgroundColor: colors.background } });
