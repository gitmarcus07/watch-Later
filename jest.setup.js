/* global jest */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Notifee's module constructor throws without the native module, so every
// suite gets the mock (per-suite tests can still override with their own
// jest.mock factory, which takes precedence).
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'release_day'),
    createTriggerNotification: jest.fn(async () => undefined),
    displayNotification: jest.fn(async () => undefined),
    cancelNotification: jest.fn(async () => undefined),
    cancelDisplayedNotification: jest.fn(async () => undefined),
    cancelTriggerNotifications: jest.fn(async () => undefined),
    getTriggerNotificationIds: jest.fn(async () => []),
    onForegroundEvent: jest.fn(() => () => undefined),
    onBackgroundEvent: jest.fn(() => undefined),
    getInitialNotification: jest.fn(async () => undefined),
  },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
}));
