import { CatalogError } from '@/domain/errors/CatalogError';
import { catalogConfig, getTvdbApiKey } from '@/data/remote/catalog/config';
import { requestJson, withQuery } from '@/data/remote/catalog/request';
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

function base(): string {
  return catalogConfig.tvdbBase.replace(/\/$/, '');
}

function url(path: string): string {
  return `${base()}/${path.replace(/^\//, '')}`;
}

/** Cached bearer token + expiry (TVDB tokens live ~a month). */
let cachedToken: string | undefined;
let tokenExpiresAt = 0;
let loginInFlight: Promise<string> | undefined;

async function login(signal?: AbortSignal): Promise<string> {
  const apiKey = getTvdbApiKey();
  if (!apiKey) throw new CatalogError('tvdb', 'configuration');
  const response = await requestJson<{ data?: { token?: string | null } | null }>(
    'tvdb',
    url('login'),
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ apikey: apiKey }) },
    signal,
  );
  const token = response?.data?.token;
  if (!token) throw new CatalogError('tvdb', 'unauthorized', 401);
  cachedToken = token;
  // Refresh a day before the nominal month-long lifetime.
  tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;
  return token;
}

async function bearer(signal?: AbortSignal): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  if (!loginInFlight) {
    loginInFlight = login(signal).finally(() => {
      loginInFlight = undefined;
    });
  }
  return loginInFlight;
}

async function get<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal, retryAuth = true): Promise<T> {
  const token = await bearer(signal);
  // Prefer English text; TVDB defaults vary per entry otherwise.
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Language': 'en' };
  try {
    return await requestJson<T>('tvdb', withQuery(url(path), params), { headers }, signal);
  } catch (error) {
    // Tokens can be revoked server-side; one transparent re-login, then give up.
    if (retryAuth && error instanceof CatalogError && (error.status === 401 || error.status === 403)) {
      cachedToken = undefined;
      const fresh = await bearer(signal);
      return requestJson<T>('tvdb', withQuery(url(path), params), { headers: { ...headers, Authorization: `Bearer ${fresh}` } }, signal);
    }
    throw error;
  }
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

/** Test-only reset for the cached bearer token. */
export function __resetTvdbClientForTests(): void {
  cachedToken = undefined;
  tokenExpiresAt = 0;
  loginInFlight = undefined;
}
