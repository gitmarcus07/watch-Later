import notifee from '@notifee/react-native';
import type { Event as NotifeeEvent } from '@notifee/react-native';
import { handleMoveToAsap, interpretReleaseDayEvent } from './upcomingReminders';
import { logger } from '@/lib/logger';

/**
 * Headless "Move to ASAP" handler. Registered at bundle top-level (imported
 * by `app/_layout.tsx`) so it runs when the app is backgrounded or killed:
 * the action button has no `launchActivity`, so the app never opens — this
 * saves the title to the Watchlist with ASAP priority and dismisses the
 * notification. No React context here: local SQLite write only, the sync
 * outbox uploads on the next foreground. Never throws.
 */
try {
  notifee.onBackgroundEvent(async (event: NotifeeEvent) => {
    try {
      const outcome = interpretReleaseDayEvent(event);
      if (outcome.kind === 'move') {
        await handleMoveToAsap({ data: outcome.data, notificationId: outcome.notificationId });
      }
      // Body taps in background/killed: Notifee opens the app itself, and
      // navigation happens via getInitialNotification in the layout.
    } catch (error) {
      logger.error('Release-day background event failed', error);
    }
  });
} catch {
  // No native module (Expo Go): reminders silently disable.
}
