import type { CatalogMedia, MediaIdentity, WatchProviderGroup } from '@/domain/models/media';
import type { OttReleaseFilter, OttReleaseRecord } from '@/domain/models/ottRelease';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { sqliteOttReleaseRepository } from '@/data/local/repositories/SqliteOttReleaseRepository';
import { supabaseOttReleaseRepository } from '@/data/remote/ott/SupabaseOttReleaseRepository';
import { compareOttReleases } from '@/features/ott/ottLabels';
import { OTT_DEFAULT_COUNTRY } from '@/features/ott/platforms';
import { logger } from '@/lib/logger';

export type OttDataSource = 'remote' | 'cache' | 'unavailable';

export interface OttMediaInfo {
  /** Verified announcement records for this title + country. */
  records: OttReleaseRecord[];
  /**
   * Live TMDB `IN` availability right now. CURRENT streaming only — never a
   * future premiere, and never merged into `records`.
   */
  indiaStreaming: WatchProviderGroup[];
  source: OttDataSource;
  loadError?: string;
}

export interface OttListResult {
  records: OttReleaseRecord[];
  source: OttDataSource;
  loadError?: string;
}

/**
 * Resolves the identity to ask TMDB about. TVDB titles bridge through the
 * TMDb id TVDB itself records; other non-TMDB providers have no
 * region-scoped provider data and honestly resolve to nothing.
 */
export function tmdbLookupIdentity(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId' | 'tmdbRefId'>): MediaIdentity | undefined {
  if (media.provider === 'tmdb' && (media.mediaType === 'movie' || media.mediaType === 'series')) {
    return { provider: 'tmdb', mediaType: media.mediaType, providerId: media.providerId };
  }
  if (media.tmdbRefId && media.mediaType !== 'anime') {
    return { provider: 'tmdb', mediaType: media.mediaType, providerId: media.tmdbRefId };
  }
  // Anime films bridged as TMDb movies (see useTmdbEnrichment).
  if (media.tmdbRefId) {
    return { provider: 'tmdb', mediaType: 'movie', providerId: media.tmdbRefId };
  }
  return undefined;
}

async function loadIndiaStreaming(
  media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId' | 'tmdbRefId'>,
  signal?: AbortSignal,
): Promise<WatchProviderGroup[]> {
  const lookup = tmdbLookupIdentity(media);
  if (!lookup) return [];
  try {
    return await catalogRepository.getWatchProvidersForRegion(lookup, OTT_DEFAULT_COUNTRY, signal);
  } catch (error) {
    logger.error('India availability lookup failed', error);
    return [];
  }
}

/**
 * Verified records for one title (default `IN`), remote-first with SQLite
 * fallback. Future dates are NEVER inferred here — only stored verified
 * announcements are returned in `records`.
 */
export async function getOttForMedia(
  media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId' | 'tmdbRefId'> & { providerId: string },
  identity: MediaIdentity,
  country: string = OTT_DEFAULT_COUNTRY,
  signal?: AbortSignal,
): Promise<OttMediaInfo> {
  const indiaStreaming = await loadIndiaStreaming(media, signal);
  try {
    const records = await supabaseOttReleaseRepository.getForMedia(identity, country);
    if (records.length) void sqliteOttReleaseRepository.cacheRecords(records).catch(() => undefined);
    return { records, indiaStreaming, source: 'remote' };
  } catch (error) {
    logger.error('OTT remote fetch failed, using cache', error);
    try {
      const cached = await sqliteOttReleaseRepository.getForMedia(identity, country);
      return {
        records: cached,
        indiaStreaming,
        source: cached.length ? 'cache' : 'unavailable',
        loadError: cached.length ? undefined : 'Verified OTT details could not be loaded. Check your connection and try again.',
      };
    } catch {
      return { records: [], indiaStreaming, source: 'unavailable', loadError: 'Verified OTT details could not be loaded. Check your connection and try again.' };
    }
  }
}

export async function listOttReleases(filter?: OttReleaseFilter): Promise<OttListResult> {
  const scoped: OttReleaseFilter = { country: OTT_DEFAULT_COUNTRY, limit: 100, ...filter };
  try {
    const records = await supabaseOttReleaseRepository.list(scoped);
    if (records.length) void sqliteOttReleaseRepository.cacheRecords(records).catch(() => undefined);
    return { records: [...records].sort(compareOttReleases), source: 'remote' };
  } catch (error) {
    logger.error('OTT list fetch failed, using cache', error);
    const cached = await sqliteOttReleaseRepository.list(scoped);
    return {
      records: cached,
      source: cached.length ? 'cache' : 'unavailable',
      loadError: cached.length ? undefined : 'Upcoming OTT releases could not be loaded. Check your connection and try again.',
    };
  }
}
