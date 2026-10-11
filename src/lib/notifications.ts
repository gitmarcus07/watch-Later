import type * as ExpoNotifications from 'expo-notifications';

type NotificationsModule = typeof ExpoNotifications;

/**
 * Expo Go-safe handle on `expo-notifications`.
 *
 * On Android Expo Go (SDK 53+) merely importing `expo-notifications`
 * throws at module load, which would red-screen the whole app at startup.
 * Dev builds load the real native module; everywhere else callers get a
 * stub whose methods reject — every scheduler already treats those
 * failures as "unavailable", so reminders silently disable in Expo Go
 * while the rest of the app works.
 */
function unavailable(method: string): (...args: never[]) => Promise<never> {
  return () => Promise.reject(new Error(`expo-notifications.${method} is unavailable in this client`));
}

const expoGoStub = {
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  setNotificationHandler: () => undefined,
  getPermissionsAsync: unavailable('getPermissionsAsync'),
  requestPermissionsAsync: unavailable('requestPermissionsAsync'),
  setNotificationChannelAsync: unavailable('setNotificationChannelAsync'),
  cancelAllScheduledNotificationsAsync: unavailable('cancelAllScheduledNotificationsAsync'),
  cancelScheduledNotificationAsync: unavailable('cancelScheduledNotificationAsync'),
  scheduleNotificationAsync: unavailable('scheduleNotificationAsync'),
} as unknown as NotificationsModule;

let resolved: NotificationsModule;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  resolved = require('expo-notifications') as NotificationsModule;
} catch {
  resolved = expoGoStub;
}

export const Notifications: NotificationsModule = resolved;
