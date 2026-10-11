import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { queryClient } from "@/lib/query/queryClient";
import { colors } from "@/theme";
import { logger } from "@/lib/logger";
import { hydrateSession, persistSession } from "@/store/app/sessionPersistence";
import { useSessionStore } from "@/store/app/sessionStore";
import { useAppearanceStore } from "@/store/app/appearanceStore";
import { useNotificationStore } from "@/store/app/notificationStore";
import { useRatingSettings } from "@/store/app/ratingSettings";
import { useTvPreferences } from "@/store/app/tvPreferences";
import { SqliteDatabaseRepository } from "@/data/local/repositories/SqliteDatabaseRepository";
import { LoadingView } from "@/components/feedback/FeedbackViews";
import SplashScreenView from "@/components/SplashScreen";
import { AppErrorBoundary } from "@/components/feedback/AppErrorBoundary";
import { DialogProvider } from "@/components/feedback/AppDialog";
import { supabase } from "@/data/remote/supabase/client";
import {
  handleAutoSyncForeground,
  scheduleAutoSync,
  startAutoSync,
} from "@/features/sync/autoSync";
import {
  refreshRemindersOnForeground,
  setupNotificationHandler,
} from "@/features/notifications/scheduler";
import { refreshOttReminders } from "@/features/ott/ottReminders";
import { refreshUpcomingReminders } from "@/features/notifications/upcomingReminders";
import { watchStateSyncRepository } from "@/data/local/repositories/SqliteWatchStateRepository";

const database = new SqliteDatabaseRepository();

// Keep the native splash up until the JS splash has rendered its first frame.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Cold start only: foreground resumes never remount the root layout, and this
// guard also keeps Fast Refresh from replaying the splash in development.
let splashShownThisLaunch = false;

export default function RootLayout() {
  const hydrated = useSessionStore((state) => state.hasHydrated);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const [splashDone, setSplashDone] = useState(splashShownThisLaunch);
  const nativeHidden = useRef(false);

  // Native splash → animated splash handoff (same logo + background, no flicker).
  const handleRootLayout = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  };

  useEffect(() => {
    setupNotificationHandler();
    void hydrateSession();
    void useAppearanceStore.getState().hydrate();
    void useNotificationStore.getState().hydrate();
    void useRatingSettings.getState().hydrate();
    void useTvPreferences.getState().hydrate();
    void database
      .initialize()
      .then(() => setDatabaseReady(true))
      .catch((error: unknown) => {
        logger.error("Database startup failed", error);
        setStartupError(true);
      });
  }, []);

  useEffect(() => {
    const authClient = supabase;
    if (!authClient) return;
    const { data: subscription } = authClient.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          const authenticated = {
            mode: "authenticated" as const,
            userId: session.user.id,
            email: session.user.email ?? "",
          };
          setTimeout(() => {
            void watchStateSyncRepository
              .bindAccount(session.user.id)
              .then(async () => {
                const current = useSessionStore.getState();
                current.setSession(authenticated);
                await persistSession(authenticated, current.onboardingComplete);
                if (
                  event === "SIGNED_IN" ||
                  event === "INITIAL_SESSION" ||
                  event === "TOKEN_REFRESHED"
                )
                  scheduleAutoSync("auth");
              })
              .catch(async () => {
                await authClient.auth.signOut();
                const current = useSessionStore.getState();
                const guest = {
                  mode: "guest" as const,
                  userId: `guest-${Date.now()}`,
                };
                current.setSession(guest);
                await persistSession(guest, current.onboardingComplete);
              });
          }, 0);
        } else if (
          event === "SIGNED_OUT" &&
          useSessionStore.getState().session.mode === "authenticated"
        ) {
          const current = useSessionStore.getState();
          const guest = {
            mode: "guest" as const,
            userId: `guest-${Date.now()}`,
          };
          current.setSession(guest);
          void persistSession(guest, current.onboardingComplete);
        }
      },
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void queryClient.resumePausedMutations();
        const session = useSessionStore.getState().session;
        if (session.mode === "authenticated") handleAutoSyncForeground();
        void refreshRemindersOnForeground();
        void refreshOttReminders();
        void refreshUpcomingReminders();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => startAutoSync(), []);

  // Ready = local init only (session restore + SQLite). Network sync always runs in the background.
  const appReady = hydrated && (databaseReady || startupError);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.root} onLayout={handleRootLayout}>
        <DialogProvider>
          <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
              <StatusBar style="light" />
              {appReady ? (
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: "fade",
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(onboarding)/welcome" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="(auth)/login"
                    options={{ presentation: "modal" }}
                  />
                  <Stack.Screen
                    name="(auth)/create-account"
                    options={{ presentation: "modal" }}
                  />
                </Stack>
              ) : (
                <View style={styles.startup}>
                  <LoadingView label="Getting things ready" />
                </View>
              )}
              {!splashDone ? (
                <SplashScreenView
                  isReady={appReady}
                  minDuration={6000}
                  onClap={() =>
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
                  }
                  onFinish={() => {
                    splashShownThisLaunch = true;
                    setSplashDone(true);
                  }}
                />
              ) : null}
            </QueryClientProvider>
          </SafeAreaProvider>
        </DialogProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070312" },
  startup: { flex: 1, backgroundColor: colors.background },
});
