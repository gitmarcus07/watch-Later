import { AppError } from '@/domain/errors/AppError';
import type { NewOttReleaseRecord, OttReleaseRecord } from '@/domain/models/ottRelease';
import { adminDeleteOttRecord, adminUpsertOttRecord } from '@/data/remote/ott/ottAdminApi';
import {
  checkAdminPin,
  clearAdminPin,
  clearSessionServiceKey,
  getSessionServiceKey,
  hasAdminPin,
  setAdminPin,
  setSessionServiceKey,
} from '@/features/ott/adminSession';
import { __resetOttRefreshForTests, OTT_NOTIFICATION_COLOR, OTT_NOTIFICATION_SOUND, OTT_PREMIERES_CHANNEL_ID, ottNotificationRequest, ottPreviewContent, ottReminderId, refreshOttReminders, sendTestNotification, type OttRefreshDeps } from '@/features/ott/ottReminders';
import { ottRecordId } from '@/features/ott/ottLabels';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'test-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNotifications = require('expo-notifications') as {
  scheduleNotificationAsync: jest.Mock;
};

function validInput(overrides: Partial<NewOttReleaseRecord> = {}): NewOttReleaseRecord {
  return {
    provider: 'tmdb',
    mediaType: 'movie',
    providerId: '872906',
    movieTitle: 'Jawan',
    platform: 'Netflix',
    country: 'IN',
    ottReleaseDate: '2026-11',
    datePrecision: 'month',
    status: 'expected',
    sourceUrl: 'https://www.netflix.com/tudum/announcement',
    lastVerifiedAt: '2026-10-10T00:00:00.000Z',
    isPremiere: true,
    ...overrides,
  };
}

function stored(overrides: Partial<NewOttReleaseRecord> = {}): OttReleaseRecord {
  const input = validInput(overrides);
  return {
    ...input,
    id: input.id ?? ottRecordId({ identity: input, platform: input.platform, country: input.country, isPremiere: input.isPremiere }),
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  };
}

function fakeDeps(overrides: Partial<OttRefreshDeps> = {}): OttRefreshDeps & { scheduled: { record: OttReleaseRecord; date: Date }[]; cancelled: string[] } {
  const scheduled: { record: OttReleaseRecord; date: Date }[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    getNotifiedIds: async () => [],
    getCachedRecords: async () => [],
    getPermission: async () => ({ status: 'granted' }),
    ensureChannel: async () => undefined,
    cancel: async (identifier: string) => { cancelled.push(identifier); },
    schedule: async (record: OttReleaseRecord, date: Date) => { scheduled.push({ record, date }); },
    now: () => new Date(2026, 9, 10, 12, 0, 0),
    ...overrides,
  };
}

describe('OTT admin write API', () => {
  const realFetch = globalThis.fetch;
  const realUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = realUrl;
    jest.restoreAllMocks();
  });

  it('validates before touching the network', async () => {
    const invalid = validInput({ status: 'confirmed', sourceUrl: undefined, ottReleaseDate: undefined, datePrecision: 'unknown' });
    await expect(adminUpsertOttRecord(invalid, 'service-key')).rejects.toBeInstanceOf(AppError);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses to save without a session service key', async () => {
    await expect(adminUpsertOttRecord(validInput(), '  ')).rejects.toMatchObject({ kind: 'authentication' });
    await expect(adminDeleteOttRecord('some-id', '')).rejects.toMatchObject({ kind: 'authentication' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('maps rejected keys to authentication errors', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 403 }) as Response);
    await expect(adminUpsertOttRecord(validInput(), 'bad-key')).rejects.toMatchObject({ kind: 'authentication' });
    await expect(adminDeleteOttRecord('some-id', 'bad-key')).rejects.toMatchObject({ kind: 'authentication' });
  });

  it('saves and deletes with the service key', async () => {
    await adminUpsertOttRecord(validInput(), 'service-key');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/ott_releases');
    expect((init.method ?? '').toUpperCase()).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer service-key' });
    await adminDeleteOttRecord('ott:tmdb:movie:1:netflix:IN:premiere', 'service-key');
    const [deleteUrl, deleteInit] = (globalThis.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
    expect((deleteInit.method ?? '').toUpperCase()).toBe('DELETE');
    expect(deleteUrl).toContain('id=eq.');
  });
});

describe('OTT admin PIN session', () => {
  beforeEach(async () => {
    await clearAdminPin();
    clearSessionServiceKey();
  });

  it('sets, checks, and clears a device-local PIN', async () => {
    expect(await hasAdminPin()).toBe(false);
    await setAdminPin('2468');
    expect(await hasAdminPin()).toBe(true);
    expect(await checkAdminPin('2468')).toBe(true);
    expect(await checkAdminPin('0000')).toBe(false);
    await clearAdminPin();
    expect(await hasAdminPin()).toBe(false);
  });

  it('keeps the service key in memory only', () => {
    expect(getSessionServiceKey()).toBeNull();
    setSessionServiceKey('service-key');
    expect(getSessionServiceKey()).toBe('service-key');
    setSessionServiceKey('   ');
    expect(getSessionServiceKey()).toBeNull();
    setSessionServiceKey('service-key');
    clearSessionServiceKey();
    expect(getSessionServiceKey()).toBeNull();
  });
});

describe('OTT reminder refresh', () => {
  beforeEach(() => __resetOttRefreshForTests());

  it('schedules exact future dates and cancels stale ones without prompting', async () => {
    const future = stored({ providerId: '1', movieTitle: 'Future', ottReleaseDate: '2026-10-11', datePrecision: 'exact' });
    const past = stored({ providerId: '2', movieTitle: 'Past', ottReleaseDate: '2026-10-01', datePrecision: 'exact' });
    const undated = stored({ providerId: '3', movieTitle: 'Undated', status: 'unannounced', ottReleaseDate: undefined, datePrecision: 'unknown' });
    const deps = fakeDeps({
      getNotifiedIds: async () => [future.id, past.id, undated.id, 'ott:ghost'],
      getCachedRecords: async () => [future, past, undated],
    });
    const scheduled = await refreshOttReminders(deps, new Date(2026, 9, 10, 12, 0, 0).getTime());
    expect(scheduled).toBe(1);
    expect(deps.scheduled.map(({ record }) => record.id)).toEqual([future.id]);
    expect(deps.scheduled[0].date.getHours()).toBe(9);
    expect(deps.cancelled).toEqual(expect.arrayContaining([ottReminderId(past.id), ottReminderId(undated.id), ottReminderId('ott:ghost')]));
  });

  it('does nothing when notification permission is not granted', async () => {
    const deps = fakeDeps({
      getPermission: async () => ({ status: 'denied' }),
      getNotifiedIds: async () => { throw new Error('must not be called'); },
    });
    expect(await refreshOttReminders(deps)).toBe(0);
    expect(deps.scheduled).toEqual([]);
  });

  it('cooldown-guards foreground refreshes', async () => {
    const getNotifiedIds = jest.fn(async () => [] as string[]);
    const deps = fakeDeps({ getNotifiedIds });
    const at = new Date(2026, 9, 10, 12, 0, 0).getTime();
    expect(await refreshOttReminders(deps, at)).toBe(0);
    expect(getNotifiedIds).toHaveBeenCalledTimes(1);
    expect(await refreshOttReminders(deps, at + 1000)).toBe(0);
    expect(getNotifiedIds).toHaveBeenCalledTimes(1);
  });

  it('previews the record-accurate alert content', async () => {
    const content = ottPreviewContent({ movieTitle: 'Jawan', platform: 'Netflix' });
    expect(content).toEqual({
      title: 'Jawan on Netflix',
      body: 'Streaming in India today — Jawan premieres on Netflix.',
    });
    expect(await sendTestNotification(content)).toBe('scheduled');
    expect(MockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const scheduled = MockNotifications.scheduleNotificationAsync.mock.calls[0][0] as {
      content: { title: string; body: string };
    };
    expect(scheduled.content.title).toBe('Jawan on Netflix');
    expect(scheduled.content.body).toContain('Jawan premieres on Netflix');
  });

  it('brands premiere alerts with color, sound, and channel', () => {
    const record = stored({ providerId: '1', movieTitle: 'Jawan', platform: 'Netflix' });
    const date = new Date(2026, 10, 6, 9, 0, 0);
    const request = ottNotificationRequest(record, date);
    expect(request.identifier).toBe(ottReminderId(record.id));
    expect(request.content.color).toBe(OTT_NOTIFICATION_COLOR);
    expect(request.content.sound).toBe(OTT_NOTIFICATION_SOUND);
    expect(request.trigger.channelId).toBe(OTT_PREMIERES_CHANNEL_ID);
    expect(request.trigger.date).toBe(date);
  });
});
