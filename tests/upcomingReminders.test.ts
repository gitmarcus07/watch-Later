import { Platform } from 'react-native';
import {
  __resetUpcomingRefreshForTests,
  ensureReleasesChannel,
  refreshUpcomingReminders,
  setUpcomingReminder,
  upcomingNotificationContent,
  upcomingReminderDate,
  upcomingReminderId,
  UPCOMING_RELEASES_CHANNEL_ID,
  type UpcomingRefreshDeps,
} from '@/features/notifications/upcomingReminders';
import type { CatalogMedia } from '@/domain/models/media';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNotifications = require('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
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

  it('builds stable identifiers per title', () => {
    expect(upcomingReminderId(media())).toBe('upcoming:tmdb:movie:42');
    expect(upcomingReminderId(media())).toBe(upcomingReminderId(media({ title: 'Renamed' })));
  });

  it('brands movie and series alerts differently with the app chime', () => {
    const movie = upcomingNotificationContent(media());
    expect(movie.body).toContain('releases today');
    expect(movie.color).toBe('#A855F7');
    expect(movie.sound).toBe('notification_sound.wav');
    expect(movie.data).toMatchObject({ route: '/media/[id]', mediaId: 'tmdb:movie:42' });
    const series = upcomingNotificationContent(media({ mediaType: 'series', id: 'tmdb:series:7', title: 'Soon Show' }));
    expect(series.body).toContain('premieres today');
  });

  it('schedules a branded alert on the release channel', async () => {
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'scheduled' });
    expect(MockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      UPCOMING_RELEASES_CHANNEL_ID,
      expect.objectContaining({ importance: 4, sound: 'notification_sound.wav' }),
    );
    const scheduled = MockNotifications.scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string };
      trigger: { channelId: string };
    };
    expect(scheduled.identifier).toBe('upcoming:tmdb:movie:42');
    expect(scheduled.content.title).toBe('Future Hit');
    expect(scheduled.trigger.channelId).toBe(UPCOMING_RELEASES_CHANNEL_ID);
  });

  it('cancels the alert when interest is removed', async () => {
    const result = await setUpcomingReminder(media(), false);
    expect(result).toEqual({ status: 'off' });
    expect(MockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('upcoming:tmdb:movie:42');
  });

  it('reports denied permission without scheduling', async () => {
    MockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    MockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'denied' });
  });

  it('saves the mark without an alert for dateless titles', async () => {
    const result = await setUpcomingReminder(media({ releaseDate: undefined }), true);
    expect(result).toEqual({ status: 'saved' });
  });
});

describe('upcoming reminder refresh', () => {
  const realOS = Platform.OS;
  function deps(overrides: Partial<UpcomingRefreshDeps> = {}): UpcomingRefreshDeps & {
    scheduled: { media: CatalogMedia; date: Date }[];
    cancelled: string[];
  } {
    const scheduled: { media: CatalogMedia; date: Date }[] = [];
    const cancelled: string[] = [];
    return {
      scheduled,
      cancelled,
      getInterested: async () => [media(), media({ providerId: '43', id: 'tmdb:movie:43', title: 'Old News', releaseDate: '2020-01-01' })],
      getPermission: async () => ({ status: 'granted' }),
      ensureChannel: async () => undefined,
      cancel: async (identifier) => { cancelled.push(identifier); },
      schedule: async (item, date) => { scheduled.push({ media: item, date }); },
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

  it('schedules future releases and cancels passed ones', async () => {
    const tracking = deps();
    await expect(refreshUpcomingReminders(tracking, Date.parse('2026-01-01T00:00:00Z'))).resolves.toBe(1);
    expect(tracking.scheduled.map((entry) => entry.media.id)).toEqual(['tmdb:movie:42']);
    expect(tracking.cancelled).toEqual(['upcoming:tmdb:movie:43']);
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

  it('creates the releases channel', async () => {
    await ensureReleasesChannel();
    expect(MockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      UPCOMING_RELEASES_CHANNEL_ID,
      expect.objectContaining({ name: 'Upcoming releases' }),
    );
  });
});
