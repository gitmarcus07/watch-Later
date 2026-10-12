import { Platform } from 'react-native';
import {
  DEFAULT_PRESS_ACTION_ID,
  MOVE_TO_ASAP_ACTION_ID,
  RELEASE_DAY_BODY,
  RELEASE_DAY_CHANNEL_ID,
  RELEASE_DAY_COLOR,
  RELEASE_DAY_LARGE_ICON,
  RELEASE_DAY_SMALL_ICON,
  RELEASE_DAY_SOUND,
  __resetUpcomingRefreshForTests,
  buildReleaseDayNotification,
  ensureReleasesChannel,
  handleMoveToAsap,
  interpretReleaseDayEvent,
  isReleaseDayData,
  refreshUpcomingReminders,
  releaseDayTitle,
  resolveNotificationTarget,
  sendReleaseDayTestNotification,
  setUpcomingReminder,
  upcomingNotificationContent,
  upcomingReminderDate,
  upcomingReminderId,
  legacyUpcomingReminderId,
  type UpcomingRefreshDeps,
} from '@/features/notifications/upcomingReminders';
import { isExpoGoClient } from '@/lib/notifications';
import type { CatalogMedia } from '@/domain/models/media';

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'release_day'),
    createTriggerNotification: jest.fn(async () => undefined),
    cancelNotification: jest.fn(async () => undefined),
    getTriggerNotificationIds: jest.fn(async () => [] as string[]),
    onForegroundEvent: jest.fn(() => () => undefined),
    onBackgroundEvent: jest.fn(() => undefined),
    getInitialNotification: jest.fn(async () => undefined),
  },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNotifee = require('@notifee/react-native').default as {
  createChannel: jest.Mock;
  createTriggerNotification: jest.Mock;
  cancelNotification: jest.Mock;
  getTriggerNotificationIds: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNotifications = require('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
};

function media(overrides: Partial<CatalogMedia> = {}): CatalogMedia {
  return {
    provider: 'tmdb',
    mediaType: 'movie',
    providerId: '42',
    id: 'tmdb:movie:42',
    title: 'Future Hit',
    genres: [],
    episodeMetadata: 'available',
    releaseDate: '2099-06-15',
    ...overrides,
  };
}

describe('upcoming reminder scheduling', () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    (Platform as { OS: string }).OS = 'android';
    jest.clearAllMocks();
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = realOS;
  });
  it('targets 9am on release day and ignores past or malformed dates', () => {
    const date = upcomingReminderDate('2099-06-15', new Date(2026, 0, 1));
    expect(date?.getHours()).toBe(9);
    expect(date?.toDateString()).toBe(new Date(2099, 5, 15).toDateString());
    expect(upcomingReminderDate('2020-01-01', new Date(2026, 0, 1))).toBeUndefined();
    expect(upcomingReminderDate(undefined, new Date(2026, 0, 1))).toBeUndefined();
    expect(upcomingReminderDate('June 15th', new Date(2026, 0, 1))).toBeUndefined();
  });

  it('builds deterministic spec ids per title', () => {
    expect(upcomingReminderId(media())).toBe('release:tmdb:movie:42');
    expect(upcomingReminderId(media())).toBe(upcomingReminderId(media({ title: 'Renamed' })));
    expect(legacyUpcomingReminderId(media())).toBe('upcoming:tmdb:movie:42');
  });

  it('builds the exact Notifee payload: icons, color, tap, and action', () => {
    const payload = buildReleaseDayNotification(media());
    expect(payload.id).toBe('release:tmdb:movie:42');
    expect(payload.title).toBe('Future Hit is out today');
    expect(payload.body).toBe(RELEASE_DAY_BODY);
    expect(payload.body).toBe("It's on your Pick Later list. Move it to ASAP?");
    expect(payload.android?.channelId).toBe(RELEASE_DAY_CHANNEL_ID);
    expect(payload.android?.smallIcon).toBe(RELEASE_DAY_SMALL_ICON);
    expect(payload.android?.largeIcon).toBe(RELEASE_DAY_LARGE_ICON);
    expect(payload.android?.color).toBe(RELEASE_DAY_COLOR);
    expect(payload.android?.color).toBe('#8614D9');
    expect(payload.android?.pressAction).toMatchObject({ id: DEFAULT_PRESS_ACTION_ID });
    expect(payload.android?.actions).toEqual([{ title: 'Move to ASAP', pressAction: { id: MOVE_TO_ASAP_ACTION_ID } }]);
    expect(payload.data).toMatchObject({ type: 'release_day', route: '/media/[id]', mediaId: 'tmdb:movie:42' });
    expect(typeof (payload.data as Record<string, unknown>).mediaJson).toBe('string');
    expect(isReleaseDayData(payload.data as Record<string, unknown>)).toBe(true);
  });

  it('keeps the expo-shaped preview content on the spec copy', () => {
    const movie = upcomingNotificationContent(media());
    expect(movie.title).toBe('Future Hit is out today');
    expect(movie.body).toBe(RELEASE_DAY_BODY);
    expect(movie.color).toBe(RELEASE_DAY_COLOR);
    expect(movie.sound).toBe('wl_now_showing.wav');
    expect(movie.data).toMatchObject({ route: '/media/[id]', mediaId: 'tmdb:movie:42' });
    const series = upcomingNotificationContent(media({ mediaType: 'series', id: 'tmdb:series:7', title: 'Soon Show' }));
    expect(series.title).toBe('Soon Show is out today');
    expect(series.body).toBe(RELEASE_DAY_BODY);
  });

  it('truncates long titles but keeps the suffix visible', () => {
    expect(releaseDayTitle('Dune: Part Three')).toBe('Dune: Part Three is out today');
    expect(releaseDayTitle('  padded  ')).toBe('padded is out today');
    const long = releaseDayTitle('The Lord of the Rings: The Return of the King Extended Edition');
    expect(long.endsWith('… is out today')).toBe(true);
    expect(long.startsWith('The Lord of the Rings:')).toBe(true);
    expect(releaseDayTitle('')).toBe('A title you saved is out today');
  });

  it('routes title taps to the detail screen and rejects the rest', () => {
    expect(resolveNotificationTarget({ route: '/media/[id]', mediaId: 'tmdb:movie:42' })).toEqual({
      pathname: '/media/[id]',
      params: { id: 'tmdb:movie:42' },
    });
    expect(resolveNotificationTarget(null)).toBeNull();
    expect(resolveNotificationTarget({})).toBeNull();
    expect(resolveNotificationTarget({ route: '/other', mediaId: 'x' })).toBeNull();
    expect(resolveNotificationTarget({ route: '/media/[id]' })).toBeNull();
  });

  it('schedules a Notifee trigger on the release channel', async () => {
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'scheduled' });
    expect(MockNotifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: RELEASE_DAY_CHANNEL_ID, importance: 4, sound: RELEASE_DAY_SOUND }),
    );
    expect(RELEASE_DAY_CHANNEL_ID).toBe('release_day');
    const [payload, trigger] = MockNotifee.createTriggerNotification.mock.calls[0] as [
      { id: string; title: string },
      { type: number; timestamp: number },
    ];
    expect(payload.id).toBe('release:tmdb:movie:42');
    expect(payload.title).toBe('Future Hit is out today');
    expect(trigger.type).toBe(0);
    expect(new Date(trigger.timestamp).toDateString()).toBe(new Date(2099, 5, 15).toDateString());
  });

  it('cancels the trigger when interest is removed', async () => {
    const result = await setUpcomingReminder(media(), false);
    expect(result).toEqual({ status: 'off' });
    expect(MockNotifee.cancelNotification).toHaveBeenCalledWith('release:tmdb:movie:42');
  });

  it('reports denied permission without scheduling', async () => {
    MockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    MockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'denied' });
    expect(MockNotifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('saves the mark without an alert for dateless titles', async () => {
    const result = await setUpcomingReminder(media({ releaseDate: undefined }), true);
    expect(result).toEqual({ status: 'saved' });
  });

  it('reports unavailable without an Expo Go reason in Jest', async () => {
    expect(isExpoGoClient()).toBe(false);
    MockNotifications.getPermissionsAsync.mockRejectedValueOnce(new Error('no module'));
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'unavailable', reason: undefined });
  });
});

describe('upcoming reminder refresh', () => {
  const realOS = Platform.OS;
  function deps(overrides: Partial<UpcomingRefreshDeps> = {}): UpcomingRefreshDeps & {
    scheduled: { media: CatalogMedia; date: Date }[];
    cancelled: string[];
    legacyCancelled: string[];
  } {
    const scheduled: { media: CatalogMedia; date: Date }[] = [];
    const cancelled: string[] = [];
    const legacyCancelled: string[] = [];
    return {
      scheduled,
      cancelled,
      legacyCancelled,
      getInterested: async () => [media(), media({ providerId: '43', id: 'tmdb:movie:43', title: 'Old News', releaseDate: '2020-01-01' })],
      getPermission: async () => ({ status: 'granted' }),
      ensureChannel: async () => undefined,
      getScheduledIds: async () => [],
      cancel: async (identifier) => { cancelled.push(identifier); },
      schedule: async (item, date) => { scheduled.push({ media: item, date }); },
      getLegacyExpoIds: async () => ['upcoming:tmdb:movie:9'],
      cancelLegacyExpo: async (identifier) => { legacyCancelled.push(identifier); },
      now: () => new Date(2026, 0, 1),
      ...overrides,
    };
  }

  beforeEach(() => {
    // Channels are Android-only: run these paths as Android.
    (Platform as { OS: string }).OS = 'android';
    __resetUpcomingRefreshForTests();
  });

  afterEach(() => {
    (Platform as { OS: string }).OS = realOS;
  });

  it('schedules future releases, cancels passed ones, and sweeps legacy expo ids', async () => {
    const tracking = deps();
    await expect(refreshUpcomingReminders(tracking, Date.parse('2026-01-01T00:00:00Z'))).resolves.toBe(1);
    expect(tracking.scheduled.map((entry) => entry.media.id)).toEqual(['tmdb:movie:42']);
    expect(tracking.cancelled).toEqual(['release:tmdb:movie:43']);
    expect(tracking.legacyCancelled).toEqual(['upcoming:tmdb:movie:9']);
  });

  it('does nothing without permission and throttles repeats', async () => {
    const denied = deps({ getPermission: async () => ({ status: 'denied' }) });
    await expect(refreshUpcomingReminders(denied, Date.parse('2026-01-01T00:00:00Z'))).resolves.toBe(0);
    expect(denied.scheduled).toHaveLength(0);
    const tracking = deps();
    await expect(refreshUpcomingReminders(tracking, Date.parse('2026-01-01T00:00:00Z'))).resolves.toBe(1);
    // Inside the cooldown window the second run is skipped.
    await expect(refreshUpcomingReminders(tracking, Date.parse('2026-01-01T00:00:01Z'))).resolves.toBe(0);
  });

  it('creates the releases channel with the raw sound name', async () => {
    await ensureReleasesChannel();
    expect(MockNotifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: RELEASE_DAY_CHANNEL_ID, name: 'Release day', sound: 'wl_now_showing' }),
    );
  });

  it('moves to ASAP via the action button and dismisses', async () => {
    const saved: { media: CatalogMedia; priority: string }[] = [];
    const dismissed: string[] = [];
    const payload = buildReleaseDayNotification(media());
    const result = await handleMoveToAsap(
      { data: payload.data as unknown as Parameters<typeof handleMoveToAsap>[0]['data'], notificationId: 'release:tmdb:movie:42' },
      {
        saveToWatchlist: async (item, priority) => { saved.push({ media: item, priority }); },
        cancelNotification: async (id) => { dismissed.push(id); },
      },
    );
    expect(result).toBe('moved');
    expect(saved[0]?.priority).toBe('asap');
    expect(saved[0]?.media.title).toBe('Future Hit');
    expect(dismissed).toEqual(['release:tmdb:movie:42']);
  });

  it('ignores actions without a usable snapshot or fetch', async () => {
    await expect(
      handleMoveToAsap({ data: null }, { saveToWatchlist: async () => { throw new Error('should not save'); } }),
    ).resolves.toBe('ignored');
    await expect(
      handleMoveToAsap(
        { data: { type: 'release_day', route: '/media/[id]', mediaId: 'tmdb:movie:42' } },
        { saveToWatchlist: async () => { throw new Error('should not save'); }, fetchMediaById: async () => null },
      ),
    ).resolves.toBe('ignored');
  });

  it('interprets taps, actions, and foreign notifications', async () => {
    const payload = buildReleaseDayNotification(media());
    const data = payload.data as unknown as Record<string, unknown>;
    expect(interpretReleaseDayEvent({ type: 1, detail: { notification: { id: payload.id, data } } })).toEqual({
      kind: 'open',
      mediaId: 'tmdb:movie:42',
    });
    expect(
      interpretReleaseDayEvent({ type: 2, detail: { notification: { id: payload.id, data }, pressAction: { id: MOVE_TO_ASAP_ACTION_ID } } }),
    ).toMatchObject({ kind: 'move', notificationId: 'release:tmdb:movie:42' });
    expect(interpretReleaseDayEvent({ type: 1, detail: { notification: { id: 'other', data: { route: '/other' } } } })).toEqual({ kind: 'ignored' });
    expect(interpretReleaseDayEvent({ type: 0, detail: {} })).toEqual({ kind: 'ignored' });
  });

  it('respects the release-day toggle', async () => {
    const tracking = deps({ isEnabled: () => false });
    await expect(refreshUpcomingReminders(tracking, Date.parse('2026-02-01T00:00:00Z'))).resolves.toBe(0);
    expect(tracking.scheduled).toHaveLength(0);
  });

  it('sends a 10-second release-day test with icons and action', async () => {
    await expect(sendReleaseDayTestNotification(media())).resolves.toBe('scheduled');
    const [payload, trigger] = MockNotifee.createTriggerNotification.mock.calls[0] as [
      { title: string; android?: { largeIcon?: string; smallIcon?: string } },
      { type: number; timestamp: number },
    ];
    expect(payload.title).toBe('Future Hit is out today');
    expect(payload.android?.largeIcon).toBe(RELEASE_DAY_LARGE_ICON);
    expect(payload.android?.smallIcon).toBe(RELEASE_DAY_SMALL_ICON);
    expect(trigger.type).toBe(0);
    expect(trigger.timestamp).toBeGreaterThan(Date.now());
  });
});
