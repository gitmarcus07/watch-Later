import { AppError } from '@/domain/errors/AppError';
import type { MediaIdentity } from '@/domain/models/media';
import type { NewOttReleaseRecord, OttReleaseFilter, OttReleaseRecord } from '@/domain/models/ottRelease';
import type { OttReleaseRepository } from '@/domain/repositories/OttReleaseRepository';
import { getDatabase } from '@/data/local/database/database';
import { compareOttReleases, ottRecordId, validateOttRecord } from '@/features/ott/ottLabels';
export { applyOttFilter } from '@/features/ott/ottLabels';

interface OttRow {
  id: string; provider: string; media_type: string; provider_id: string;
  movie_title: string; platform: string; platform_logo_url: string | null;
  tmdb_provider_id: number | null; country: string; theatrical_date: string | null;
  ott_date: string | null; date_precision: OttReleaseRecord['datePrecision'];
  status: OttReleaseRecord['status']; source_url: string | null;
  source_published_at: string | null; last_verified_at: string;
  created_at: string; updated_at: string; notes: string | null; is_premiere: number;
}

function mapRow(row: OttRow): OttReleaseRecord {
  const mediaType = row.media_type === 'series' || row.media_type === 'anime' ? row.media_type : 'movie';
  const provider = row.provider === 'anilist' || row.provider === 'tvdb' ? row.provider : 'tmdb';
  return {
    provider, mediaType, providerId: row.provider_id, id: row.id,
    movieTitle: row.movie_title, platform: row.platform,
    platformLogoUrl: row.platform_logo_url ?? undefined,
    tmdbProviderId: row.tmdb_provider_id ?? undefined,
    country: row.country, theatricalReleaseDate: row.theatrical_date ?? undefined,
    ottReleaseDate: row.ott_date ?? undefined, datePrecision: row.date_precision,
    status: row.status, sourceUrl: row.source_url ?? undefined,
    sourcePublishedAt: row.source_published_at ?? undefined,
    lastVerifiedAt: row.last_verified_at, createdAt: row.created_at, updatedAt: row.updated_at,
    notes: row.notes ?? undefined, isPremiere: row.is_premiere === 1,
  };
}

function toRowParams(record: OttReleaseRecord): (string | number | null)[] {
  return [
    record.id, record.provider, record.mediaType, record.providerId, record.movieTitle,
    record.platform, record.platformLogoUrl ?? null, record.tmdbProviderId ?? null,
    record.country, record.theatricalReleaseDate ?? null, record.ottReleaseDate ?? null,
    record.datePrecision, record.status, record.sourceUrl ?? null,
    record.sourcePublishedAt ?? null, record.lastVerifiedAt, record.createdAt,
    record.updatedAt, record.notes ?? null, record.isPremiere ? 1 : 0,
  ];
}

/**
 * Local verified-record cache. Reads never throw for missing tables on
 * fresh installs mid-migration — they resolve empty instead.
 */
export class SqliteOttReleaseRepository implements OttReleaseRepository {
  async getForMedia(identity: MediaIdentity, country = 'IN'): Promise<OttReleaseRecord[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<OttRow>(
        'SELECT * FROM ott_releases WHERE provider = ? AND media_type = ? AND provider_id = ? AND country = ?',
        identity.provider, identity.mediaType, identity.providerId, country,
      );
      return rows.map(mapRow).sort(compareOttReleases);
    } catch {
      return [];
    }
  }

  async list(filter?: OttReleaseFilter): Promise<OttReleaseRecord[]> {
    try {
      const db = await getDatabase();
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filter?.country) { clauses.push('country = ?'); params.push(filter.country); }
      if (filter?.platform) { clauses.push('LOWER(platform) = LOWER(?)'); params.push(filter.platform); }
      const statuses = filter?.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
      if (statuses?.length) { clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`); params.push(...statuses); }
      if (filter?.query?.trim()) { clauses.push('LOWER(movie_title) LIKE ?'); params.push(`%${filter.query.trim().toLowerCase()}%`); }
      if (filter?.scheduledOnly) { clauses.push("ott_date IS NOT NULL AND date_precision != 'unknown'"); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Math.max(1, Math.min(filter?.limit ?? 200, 500));
      const offset = Math.max(0, filter?.offset ?? 0);
      const rows = await db.getAllAsync<OttRow>(
        `SELECT * FROM ott_releases ${where} ORDER BY CASE WHEN ott_date IS NULL OR date_precision = 'unknown' THEN 1 ELSE 0 END, ott_date ASC LIMIT ? OFFSET ?`,
        ...params, limit, offset,
      );
      return rows.map(mapRow);
    } catch {
      return [];
    }
  }

  async upsert(input: NewOttReleaseRecord, options?: { isAdmin?: boolean }): Promise<OttReleaseRecord> {
    if (options?.isAdmin !== true) {
      throw new AppError('authentication', 'Release records can only be edited by an authorized administrator.');
    }
    const errors = validateOttRecord(input);
    if (errors.length) {
      throw new AppError('validation', errors[0].message);
    }
    const now = new Date().toISOString();
    const record: OttReleaseRecord = {
      ...input,
      id: input.id ?? ottRecordId({ identity: input, platform: input.platform, country: input.country, isPremiere: input.isPremiere }),
      createdAt: now,
      updatedAt: now,
    };
    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO ott_releases (id, provider, media_type, provider_id, movie_title, platform, platform_logo_url, tmdb_provider_id, country, theatrical_date, ott_date, date_precision, status, source_url, source_published_at, last_verified_at, created_at, updated_at, notes, is_premiere)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, media_type, provider_id, platform, country, is_premiere)
         DO UPDATE SET movie_title = excluded.movie_title, platform_logo_url = excluded.platform_logo_url,
           tmdb_provider_id = excluded.tmdb_provider_id, theatrical_date = excluded.theatrical_date,
           ott_date = excluded.ott_date, date_precision = excluded.date_precision, status = excluded.status,
           source_url = excluded.source_url, source_published_at = excluded.source_published_at,
           last_verified_at = excluded.last_verified_at, updated_at = excluded.updated_at, notes = excluded.notes`,
        ...toRowParams(record),
      );
      return record;
    } catch (error) {
      throw new AppError('database', 'The OTT release could not be saved.', { cause: error });
    }
  }

  async replaceCache(records: OttReleaseRecord[]): Promise<void> {
    try {
      const db = await getDatabase();
      await db.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync('DELETE FROM ott_releases;');
        for (const record of records) {
          await transaction.runAsync(
            'INSERT OR REPLACE INTO ott_releases (id, provider, media_type, provider_id, movie_title, platform, platform_logo_url, tmdb_provider_id, country, theatrical_date, ott_date, date_precision, status, source_url, source_published_at, last_verified_at, created_at, updated_at, notes, is_premiere) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ...toRowParams(record),
          );
        }
      });
    } catch (error) {
      throw new AppError('database', 'The OTT cache could not be refreshed.', { cause: error });
    }
  }

  /**
   * Non-destructive cache merge: upserts verified rows without deleting
   * unrelated titles. Used after per-movie and paged list fetches.
   */
  async cacheRecords(records: OttReleaseRecord[]): Promise<void> {
    if (!records.length) return;
    try {
      const db = await getDatabase();
      await db.withExclusiveTransactionAsync(async (transaction) => {
        for (const record of records) {
          await transaction.runAsync(
            `INSERT INTO ott_releases (id, provider, media_type, provider_id, movie_title, platform, platform_logo_url, tmdb_provider_id, country, theatrical_date, ott_date, date_precision, status, source_url, source_published_at, last_verified_at, created_at, updated_at, notes, is_premiere)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(provider, media_type, provider_id, platform, country, is_premiere)
             DO UPDATE SET movie_title = excluded.movie_title, platform_logo_url = excluded.platform_logo_url,
               tmdb_provider_id = excluded.tmdb_provider_id, theatrical_date = excluded.theatrical_date,
               ott_date = excluded.ott_date, date_precision = excluded.date_precision, status = excluded.status,
               source_url = excluded.source_url, source_published_at = excluded.source_published_at,
               last_verified_at = excluded.last_verified_at, updated_at = excluded.updated_at, notes = excluded.notes`,
            ...toRowParams(record),
          );
        }
      });
    } catch {
      // Cache misses are non-fatal; the next remote fetch retries.
    }
  }

  /** Local notify-me preference for one verified record. Never throws. */
  async getNotifyPref(recordId: string): Promise<boolean> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ notify: number }>('SELECT notify FROM ott_notify_prefs WHERE record_id = ?', recordId);
      return (rows[0]?.notify ?? 0) === 1;
    } catch {
      return false;
    }
  }

  async setNotifyPref(recordId: string, notify: boolean): Promise<void> {
    try {
      const db = await getDatabase();
      await db.runAsync(
        `INSERT INTO ott_notify_prefs (record_id, notify, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(record_id) DO UPDATE SET notify = excluded.notify, updated_at = CURRENT_TIMESTAMP`,
        recordId, notify ? 1 : 0,
      );
    } catch {
      // Preference loss is non-fatal; the toggle simply won't persist.
    }
  }

  async getNotifiedRecords(): Promise<string[]> {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<{ record_id: string }>('SELECT record_id FROM ott_notify_prefs WHERE notify = 1');
      return rows.map((row) => row.record_id);
    } catch {
      return [];
    }
  }
}

export const sqliteOttReleaseRepository = new SqliteOttReleaseRepository();
