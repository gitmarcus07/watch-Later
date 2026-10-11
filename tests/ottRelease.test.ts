import { AppError } from '@/domain/errors/AppError';
import type { NewOttReleaseRecord, OttReleaseRecord } from '@/domain/models/ottRelease';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteOttReleaseRepository } from '@/data/local/repositories/SqliteOttReleaseRepository';
import { SupabaseOttReleaseRepository } from '@/data/remote/ott/SupabaseOttReleaseRepository';
import { tmdbLookupIdentity } from '@/features/ott/OttReleaseService';
import { OTT_DEFAULT_COUNTRY, findPlatform, platformForTmdbProvider } from '@/features/ott/platforms';
import {
  OTT_STATUS_LABELS,
  applyOttFilter,
  compareOttReleases,
  formatOttDate,
  isStaleVerification,
  ottRecordId,
  ottStatusBadge,
  validateOttRecord,
} from '@/features/ott/ottLabels';
import { ottReminderDate } from '@/features/ott/ottReminders';
import { createSqliteTestAdapter } from './sqliteTestAdapter';

function baseRecord(overrides: Partial<NewOttReleaseRecord> = {}): NewOttReleaseRecord {
  return {
    provider: 'tmdb',
    mediaType: 'movie',
    providerId: '123',
    movieTitle: 'Test Film',
    platform: 'Netflix',
    country: 'IN',
    theatricalReleaseDate: '2026-01-09',
    ottReleaseDate: '2026-03-06',
    datePrecision: 'exact',
    status: 'confirmed',
    sourceUrl: 'https://www.netflix.com/tudum/announcement',
    sourcePublishedAt: '2026-02-01T00:00:00.000Z',
    lastVerifiedAt: '2026-02-02T00:00:00.000Z',
    notes: 'Hindi + Tamil audio',
    isPremiere: true,
    ...overrides,
  };
}

function storedRecord(overrides: Partial<NewOttReleaseRecord> = {}): OttReleaseRecord {
  const input = baseRecord(overrides);
  return {
    ...input,
    id: ottRecordId({ identity: input, platform: input.platform, country: input.country, isPremiere: input.isPremiere }),
    createdAt: '2026-02-02T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
  };
}

describe('OTT release tracker (India)', () => {
  it('1. accepts a confirmed platform + exact date with source', () => {
    expect(validateOttRecord(baseRecord())).toEqual([]);
    expect(formatOttDate('2026-03-06', 'exact')).toBe('06 Mar 2026');
    expect(OTT_STATUS_LABELS.confirmed).toBe('Confirmed release date');
    expect(ottStatusBadge('confirmed')).toBe('Confirmed');
  });

  it('2. accepts a platform announcement with no date and keeps dates null', () => {
    const input = baseRecord({ status: 'platform_announced', ottReleaseDate: undefined, datePrecision: 'unknown', sourceUrl: undefined });
    expect(validateOttRecord(input)).toEqual([]);
    expect(formatOttDate(input.ottReleaseDate, input.datePrecision)).toBeUndefined();
    expect(ottStatusBadge('platform_announced')).toBe('Platform announced');
  });

  it('3. renders month/year windows without inventing a day', () => {
    expect(formatOttDate('2026-11', 'month')).toBe('Nov 2026');
    expect(formatOttDate('2026-11-20', 'month')).toBe('Nov 2026');
    expect(formatOttDate('2026', 'year')).toBe('2026');
    expect(formatOttDate('2026-03-06', 'exact')).toBe('06 Mar 2026');
    const windowed = baseRecord({ status: 'window_announced', ottReleaseDate: '2026-11', datePrecision: 'month' });
    expect(validateOttRecord(windowed)).toEqual([]);
  });

  it('4. excludes undated records from scheduled upcoming lists', () => {
    const records = [
      storedRecord({ status: 'confirmed' }),
      storedRecord({ providerId: '124', movieTitle: 'Undated Film', status: 'unannounced', ottReleaseDate: undefined, datePrecision: 'unknown' }),
    ];
    expect(applyOttFilter(records, { country: 'IN', scheduledOnly: true }).map((record) => record.movieTitle)).toEqual(['Test Film']);
    expect(applyOttFilter(records, { country: 'IN' })).toHaveLength(2);
  });

  it('5. marks released titles as streaming now and resolves TMDB lookups honestly', () => {
    expect(ottStatusBadge('released')).toBe('Streaming now');
    expect(OTT_STATUS_LABELS.released).toBe('Available now');
    expect(tmdbLookupIdentity({ provider: 'tmdb', mediaType: 'movie', providerId: '123', tmdbRefId: undefined })).toEqual({
      provider: 'tmdb', mediaType: 'movie', providerId: '123',
    });
    // TVDB titles without a bridged TMDb id have no region-scoped provider
    // data — the service reports nothing rather than guessing.
    expect(tmdbLookupIdentity({ provider: 'tvdb', mediaType: 'movie', providerId: '9', tmdbRefId: undefined })).toBeUndefined();
    expect(tmdbLookupIdentity({ provider: 'tvdb', mediaType: 'movie', providerId: '9', tmdbRefId: '123' })).toEqual({
      provider: 'tmdb', mediaType: 'movie', providerId: '123',
    });
  });

  it('6. deduplicates per movie + platform + country + release event', () => {
    const input = baseRecord();
    const same = ottRecordId({ identity: input, platform: 'Netflix', country: 'IN', isPremiere: true });
    expect(ottRecordId({ identity: input, platform: ' netflix ', country: 'in', isPremiere: true })).toBe(same);
    expect(ottRecordId({ identity: input, platform: 'Amazon Prime Video', country: 'IN', isPremiere: true })).not.toBe(same);
    expect(ottRecordId({ identity: input, platform: 'Netflix', country: 'IN', isPremiere: false })).not.toBe(same);
    const dated = storedRecord({ status: 'confirmed' });
    const undated = storedRecord({ providerId: '124', movieTitle: 'Undated Film', status: 'unannounced', ottReleaseDate: undefined, datePrecision: 'unknown' });
    expect([undated, dated].sort(compareOttReleases)).toEqual([dated, undated]);
  });

  it('7. supports postponements by updating the date and verification timestamp', () => {
    const original = storedRecord();
    const postponed = storedRecord({ ottReleaseDate: '2026-04-10', lastVerifiedAt: '2026-03-20T00:00:00.000Z' });
    expect(postponed.id).toBe(original.id);
    expect(validateOttRecord({ ...postponed })).toEqual([]);
    expect(formatOttDate(postponed.ottReleaseDate, postponed.datePrecision)).toBe('10 Apr 2026');
    expect(isStaleVerification({ lastVerifiedAt: '2026-03-20T00:00:00.000Z' }, new Date('2026-04-01T00:00:00.000Z'))).toBe(false);
  });

  it('8. fails closed when the backend is unavailable', async () => {
    const remote = new SupabaseOttReleaseRepository();
    await expect(remote.getForMedia({ provider: 'tmdb', mediaType: 'movie', providerId: '123' }, 'IN')).rejects.toBeInstanceOf(AppError);
    await expect(remote.list({ country: 'IN' })).rejects.toBeInstanceOf(AppError);
  });

  it('9. returns empty (not fabricated) results when no records match', () => {
    expect(applyOttFilter([], { country: 'IN', platform: 'Netflix' })).toEqual([]);
    expect(applyOttFilter([storedRecord()], { country: 'IN', platform: 'ZEE5' })).toEqual([]);
    expect(applyOttFilter([storedRecord()], { country: 'IN', query: 'nothing like this' })).toEqual([]);
  });

  it('10. refuses unauthorized release-data edits on every write path', async () => {
    const local = new SqliteOttReleaseRepository();
    await expect(local.upsert(baseRecord())).rejects.toMatchObject({ kind: 'authentication' });
    const remote = new SupabaseOttReleaseRepository();
    await expect(remote.upsert(baseRecord(), { isAdmin: true })).rejects.toMatchObject({ kind: 'authentication' });
  });

  it('rejects confirmed dates without a reliable source', () => {
    const errors = validateOttRecord(baseRecord({ sourceUrl: undefined }));
    expect(errors.map((error) => error.field)).toContain('sourceUrl');
    const dateless = validateOttRecord(baseRecord({ ottReleaseDate: undefined, datePrecision: 'unknown' }));
    expect(dateless.map((error) => error.field)).toContain('ottReleaseDate');
    expect(validateOttRecord(baseRecord({ sourceUrl: 'not-a-url' })).map((error) => error.field)).toContain('sourceUrl');
  });

  it('flags stale verifications instead of presenting them as fresh', () => {
    expect(isStaleVerification({ lastVerifiedAt: '2025-01-01T00:00:00.000Z' }, new Date('2026-10-10T00:00:00.000Z'))).toBe(true);
    expect(isStaleVerification({ lastVerifiedAt: '2026-09-01T00:00:00.000Z' }, new Date('2026-10-10T00:00:00.000Z'))).toBe(false);
    expect(isStaleVerification({ lastVerifiedAt: 'not-a-date' })).toBe(true);
  });

  it('schedules reminders only for exact future dates', () => {
    const now = new Date(2026, 0, 15, 12, 0, 0);
    const scheduled = ottReminderDate('2026-02-06', 'exact', now);
    expect(scheduled?.getFullYear()).toBe(2026);
    expect(scheduled?.getHours()).toBe(9);
    expect(ottReminderDate('2026-02', 'month', now)).toBeUndefined();
    expect(ottReminderDate('2026', 'year', now)).toBeUndefined();
    expect(ottReminderDate(undefined, 'unknown', now)).toBeUndefined();
    expect(ottReminderDate('2026-01-01', 'exact', now)).toBeUndefined();
  });

  it('treats the India platform list as configurable data', () => {
    expect(OTT_DEFAULT_COUNTRY).toBe('IN');
    expect(findPlatform('netflix')?.tmdbProviderId).toBe(8);
    expect(platformForTmdbProvider(8, 'Netflix').name).toBe('Netflix');
    expect(platformForTmdbProvider(999999, 'Some New Service').name).toBe('Some New Service');
  });

  it('creates the v16 OTT cache tables with dedupe constraints', async () => {
    const adapter = createSqliteTestAdapter();
    try {
      await runMigrations(adapter.database);
      const tables = await adapter.database.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ott_%'");
      expect(tables.map(({ name }) => name).sort()).toEqual(['ott_notify_prefs', 'ott_releases']);
      await adapter.database.runAsync(
        "INSERT INTO ott_releases (id, provider, media_type, provider_id, movie_title, platform, country, theatrical_date, ott_date, date_precision, status, last_verified_at, is_premiere) VALUES ('a', 'tmdb', 'movie', '1', 'Film', 'Netflix', 'IN', NULL, '2026-03-06', 'exact', 'confirmed', '2026-02-01T00:00:00.000Z', 1)",
      );
      await expect(adapter.database.runAsync(
        "INSERT INTO ott_releases (id, provider, media_type, provider_id, movie_title, platform, country, theatrical_date, ott_date, date_precision, status, last_verified_at, is_premiere) VALUES ('b', 'tmdb', 'movie', '1', 'Film', 'Netflix', 'IN', NULL, '2026-03-06', 'exact', 'confirmed', '2026-02-01T00:00:00.000Z', 1)",
      )).rejects.toThrow();
    } finally {
      adapter.close();
    }
  });
});
