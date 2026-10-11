import { Platform } from 'react-native';
import {
  __resetUpcomingRefreshForTests,
  ensureReleasesChannel,
  refreshUpcomingReminders,
  releaseDayTitle,
  resolveNotificationTarget,
  setUpcomingReminder,
  upcomingNotificationContent,
  upcomingReminderDate,
  upcomingReminderId,
  RELEASE_DAY_CHANNEL_ID,
  type UpcomingRefreshDeps,
} from '@/features/notifications/upcomingReminders';
import { isExpoGoClient } from '@/lib/notifications';
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

  it('uses the spec copy with the app chime for movies and series alike', () => {
    const movie = upcomingNotificationContent(media());
    expect(movie.title).toBe('Future Hit is out today');
    expect(movie.body).toBe('It’s on your Watch Later list — tap to view it.');
    expect(movie.color).toBe('#A855F7');
    expect(movie.sound).toBe('wl_now_showing.wav');
    expect(movie.data).toMatchObject({ route: '/media/[id]', mediaId: 'tmdb:movie:42' });
    const series = upcomingNotificationContent(media({ mediaType: 'series', id: 'tmdb:series:7', title: 'Soon Show' }));
    expect(series.title).toBe('Soon Show is out today');
    expect(series.body).toBe('It’s on your Watch Later list — tap to view it.');
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

  it('schedules a branded alert on the release channel', async () => {
    const result = await setUpcomingReminder(media(), true);
    expect(result).toEqual({ status: 'scheduled' });
    expect(MockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      RELEASE_DAY_CHANNEL_ID,
      expect.objectContaining({ importance: 4, sound: 'wl_now_showing.wav' }),
    );
    const scheduled = MockNotifications.scheduleNotificationAsync.mock.calls[0][0] as {
      identifier: string;
      content: { title: string };
      trigger: { channelId: string };
    };
    expect(scheduled.identifier).toBe('upcoming:tmdb:movie:42');
    expect(scheduled.content.title).toBe('Future Hit is out today');
    expect(scheduled.trigger.channelId).toBe(RELEASE_DAY_CHANNEL_ID);
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
      RELEASE_DAY_CHANNEL_ID,
      expect.objectContaining({ name: 'Release day' }),
    );
  });
});
