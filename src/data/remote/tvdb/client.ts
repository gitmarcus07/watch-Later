import { CatalogError } from '@/domain/errors/CatalogError';
import { requestJson } from '@/data/remote/catalog/request';
import type {
  TvdbEpisodeDto,
  TvdbFilterMovieDto,
  TvdbFilterSeriesDto,
  TvdbListResponse,
  TvdbMovieDetailsDto,
  TvdbSearchItemDto,
  TvdbSeriesDetailsDto,
  TvdbSeriesEpisodesData,
  TvdbSingleResponse,
} from './types';

// TVDB is reached only through the `tvdb-proxy` Supabase Edge Function, never
// directly. The API key lives in that function's secrets; nothing here ships a
// secret, and TVDB's login/token lifecycle is entirely server-side — which is
// why this client no longer caches a bearer token at all.
const PROXY_FUNCTION = 'tvdb-proxy';

function proxyUrl(): string {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base) throw new CatalogError('tvdb', 'configuration');
  return `${base}/functions/v1/${PROXY_FUNCTION}`;
}

/** The public anon key — safe to ship. It only authorizes the call to Supabase. */
function anonKey(): string {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new CatalogError('tvdb', 'configuration');
  return key;
}

async function get<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(
    'tvdb',
    proxyUrl(),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey()}` },
      // Undefined/null params are dropped by the proxy.
      body: JSON.stringify({ path, params }),
    },
    signal,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const tvdbClient = {
  /** Search movies + series (+ lists, filtered out by callers). Throws CatalogError on failure. */
  async search(query: string, type: 'movie' | 'series' | 'all', signal?: AbortSignal): Promise<TvdbSearchItemDto[]> {
    const params: Record<string, string | number | undefined> =
      type === 'all' ? { query } : { query, type };
    const response = await get<TvdbListResponse<TvdbSearchItemDto>>('search', params, signal);
    if (!response || !Array.isArray(response.data)) throw new CatalogError('tvdb', 'invalid_response');
    return response.data.filter((item) => item !== null && (item.type === 'movie' || item.type === 'series'));
  },

  async getMovie(id: string, signal?: AbortSignal): Promise<TvdbMovieDetailsDto> {
    const response = await get<TvdbSingleResponse<TvdbMovieDetailsDto>>(`movies/${encodeURIComponent(id)}/extended`, {}, signal);
    if (!response?.data || !Number.isSafeInteger(response.data.id) || typeof response.data.name !== 'string') {
      throw new CatalogError('tvdb', 'not_found', 404);
    }
    return response.data;
  },

  async getSeries(id: string, signal?: AbortSignal): Promise<TvdbSeriesDetailsDto> {
    const response = await get<TvdbSingleResponse<TvdbSeriesDetailsDto>>(`series/${encodeURIComponent(id)}/extended`, {}, signal);
    if (!response?.data || !Number.isSafeInteger(response.data.id) || typeof response.data.name !== 'string') {
      throw new CatalogError('tvdb', 'not_found', 404);
    }
    return response.data;
  },

  /**
   * Every episode of a series in default (aired) order. Pages hold up to 500
   * rows; fetched sequentially with a polite pause and capped so runaway
   * long-runners can't loop the provider.
   */
  async getAllSeriesEpisodes(id: string, seasonType = 'default', signal?: AbortSignal, maxPages = 6): Promise<TvdbEpisodeDto[]> {
    const all: TvdbEpisodeDto[] = [];
    for (let page = 0; page < Math.max(1, maxPages); page += 1) {
      if (page > 0) await sleep(250);
      const response = await get<{ status?: string | null; data?: TvdbSeriesEpisodesData | null; links?: TvdbListResponse<unknown>['links'] }>(
        `series/${encodeURIComponent(id)}/episodes/${encodeURIComponent(seasonType)}`,
        { page },
        signal,
      );
      const episodes = response?.data?.episodes;
      if (!Array.isArray(episodes) || !episodes.length) break;
      all.push(...episodes);
      const total = response?.links?.total_items ?? 0;
      const pageSize = response?.links?.page_size ?? episodes.length;
      if (episodes.length < pageSize) break;
      if (total > 0 && all.length >= total) break;
    }
    const seen = new Set<number>();
    return all
      .filter((episode) => {
        const key = typeof episode?.id === 'number' ? episode.id : -1;
        if (key < 0 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.number ?? 0) - (b.number ?? 0));
  },

  /** Popularity-ranked movies (TVDB favorite counts), 500 per page. */
  async filterMovies(params: { page?: number; year?: number; language?: string; sort?: string; sortType?: string }, signal?: AbortSignal) {
    const response = await get<TvdbListResponse<TvdbFilterMovieDto>>('movies/filter', {
      page: params.page ?? 0,
      year: params.year,
      language: params.language,
      sort: params.sort ?? 'score',
      sortType: params.sortType ?? 'desc',
    }, signal);
    if (!response || !Array.isArray(response.data)) throw new CatalogError('tvdb', 'invalid_response');
    return response;
  },

  /** Popularity-ranked series, 500 per page. `genre` takes a numeric TVDB genre id (27 = Anime). */
  async filterSeries(params: { page?: number; year?: number; genre?: number; country?: string; sort?: string; sortType?: string }, signal?: AbortSignal) {
    const response = await get<TvdbListResponse<TvdbFilterSeriesDto>>('series/filter', {
      page: params.page ?? 0,
      year: params.year,
      genre: params.genre,
      country: params.country,
      sort: params.sort ?? 'score',
      sortType: params.sortType ?? 'desc',
    }, signal);
    if (!response || !Array.isArray(response.data)) throw new CatalogError('tvdb', 'invalid_response');
    return response;
  },
};

/**
 * Test-only reset. TVDB auth now lives entirely in the `tvdb-proxy` Edge
 * Function, so the client holds no token state to clear. Kept as a no-op so
 * existing suites that call it keep working.
 */
export function __resetTvdbClientForTests(): void {
  // Intentionally empty — see docblock.
}
