import { AppError } from '@/domain/errors/AppError';
import type { MediaIdentity } from '@/domain/models/media';
import type { NewOttReleaseRecord, OttDatePrecision, OttReleaseFilter, OttReleaseRecord, OttReleaseStatus } from '@/domain/models/ottRelease';
import type { OttReleaseRepository } from '@/domain/repositories/OttReleaseRepository';
import { supabase, type CloudOttReleaseRow } from '@/data/remote/supabase/client';
import { compareOttReleases } from '@/features/ott/ottLabels';

const PRECISIONS: readonly string[] = ['exact', 'month', 'year', 'unknown'];
const STATUSES: readonly string[] = ['confirmed', 'expected', 'window_announced', 'platform_announced', 'unannounced', 'released'];

function isPrecision(value: string): value is OttDatePrecision {
  return PRECISIONS.includes(value);
}

function isStatus(value: string): value is OttReleaseStatus {
  return STATUSES.includes(value);
}

function mapRow(row: CloudOttReleaseRow): OttReleaseRecord | null {
  if (!isPrecision(row.date_precision) || !isStatus(row.status)) return null;
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
    notes: row.notes ?? undefined, isPremiere: row.is_premiere,
  };
}

/**
 * Cloud verified-record source. Public read; writes are admin-only and never
 * issued from the Expo client — `upsert` always refuses so unauthorized
 * edits fail closed even before RLS. Admins write via the Supabase
 * dashboard or a service-role edge function.
 */
export class SupabaseOttReleaseRepository implements OttReleaseRepository {
  private ensureClient() {
    if (!supabase) throw new AppError('database', 'The release database is not configured on this device.');
    return supabase;
  }

  async getForMedia(identity: MediaIdentity, country = 'IN'): Promise<OttReleaseRecord[]> {
    const client = this.ensureClient();
    const { data, error } = await client
      .from('ott_releases')
      .select('*')
      .eq('provider', identity.provider)
      .eq('media_type', identity.mediaType)
      .eq('provider_id', identity.providerId)
      .eq('country', country);
    if (error) throw new AppError('network', 'Verified OTT details could not be loaded.', { cause: error });
    return (data ?? [])
      .map(mapRow)
      .filter((row): row is OttReleaseRecord => row !== null)
      .sort(compareOttReleases);
  }

  async list(filter?: OttReleaseFilter): Promise<OttReleaseRecord[]> {
    const client = this.ensureClient();
    let query = client.from('ott_releases').select('*');
    if (filter?.country) query = query.eq('country', filter.country);
    if (filter?.platform) query = query.ilike('platform', filter.platform);
    const statuses = filter?.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
    if (statuses?.length) query = query.in('status', [...statuses]);
    if (filter?.query?.trim()) query = query.ilike('movie_title', `%${filter.query.trim()}%`);
    if (filter?.scheduledOnly) query = query.not('ott_date', 'is', null).neq('date_precision', 'unknown');
    const limit = Math.max(1, Math.min(filter?.limit ?? 200, 500));
    const offset = Math.max(0, filter?.offset ?? 0);
    query = query.order('ott_date', { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) throw new AppError('network', 'Upcoming OTT releases could not be loaded.', { cause: error });
    return (data ?? [])
      .map(mapRow)
      .filter((row): row is OttReleaseRecord => row !== null)
      .sort(compareOttReleases);
  }

  async upsert(_record: NewOttReleaseRecord, _options?: { isAdmin?: boolean }): Promise<OttReleaseRecord> {
    throw new AppError(
      'authentication',
      'Release records can only be edited by an authorized administrator through the Supabase dashboard or admin service — never from this app.',
    );
  }

  async replaceCache(): Promise<void> {
    // The cloud is the source of truth; cache replacement is owned by the
    // SQLite repository. This is intentionally a no-op.
  }
}

export const supabaseOttReleaseRepository = new SupabaseOttReleaseRepository();
