import { CatalogError } from '@/domain/errors/CatalogError';
import type { CatalogFilter, CatalogMedia, CatalogSeason, CatalogSearchResult, MediaIdentity, MediaProvider } from '@/domain/models/media';
import type { CatalogRepository as CatalogRepositoryContract } from '@/domain/repositories/CatalogRepository';
import { mapAniListAnime } from '@/data/remote/anilist/mappers';
import { anilistClient } from '@/data/remote/anilist/client';
import { mapTmdbMovie, mapTmdbSeason, mapTmdbTv } from '@/data/remote/tmdb/mappers';
import { tmdbClient } from '@/data/remote/tmdb/client';

function normalizeTitle(title: string): string {
  return title.normalize('NFKD').toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '');
}

export function mergeCatalogResults(groups: readonly (readonly CatalogMedia[])[]): CatalogMedia[] {
  const seen = new Set<string>();
  const merged: CatalogMedia[] = [];
  for (const media of groups.flat()) {
    const title = normalizeTitle(media.title);
    const key = `${title}:${media.year ?? ''}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    merged.push(media);
  }
  return merged;
}

function isProviderIdentity(identity: MediaIdentity): boolean {
  return (identity.provider === 'tmdb' && (identity.mediaType === 'movie' || identity.mediaType === 'series')) || (identity.provider === 'anilist' && identity.mediaType === 'anime');
}

/** Round-robin interleave of ranked lists so no single provider dominates. */
export function interleaveRanked(groups: readonly (readonly CatalogMedia[])[], limit = 15): CatalogMedia[] {
  const seen = new Set<string>();
  const merged: CatalogMedia[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest && merged.length < limit; index += 1) {
    for (const group of groups) {
      const item = group[index];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

function orderByRecency(items: readonly CatalogMedia[], limit = 15): CatalogMedia[] {
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}

function numericId(identity: MediaIdentity): number {
  const id = Number(identity.providerId);
  if (!Number.isSafeInteger(id) || id < 1) throw new CatalogError(identity.provider, 'not_found', 404);
  return id;
}

export class RemoteCatalogRepository implements CatalogRepositoryContract {
  async search(query: string, filter: CatalogFilter, signal?: AbortSignal): Promise<CatalogSearchResult> {
    const term = query.trim();
    if (!term) return { items: [], unavailableProviders: [] };
    const tasks: { provider: MediaProvider; load: () => Promise<CatalogMedia[]> }[] = [];
    if (filter === 'all' || filter === 'movies') tasks.push({ provider: 'tmdb', load: async () => (await tmdbClient.searchMovies(term, signal)).results.map(mapTmdbMovie) });
    if (filter === 'all' || filter === 'series') tasks.push({ provider: 'tmdb', load: async () => (await tmdbClient.searchTv(term, signal)).results.map(mapTmdbTv) });
    if (filter === 'all' || filter === 'anime') tasks.push({ provider: 'anilist', load: async () => (await anilistClient.searchAnime(term, signal)).map(mapAniListAnime) });
    const settled = await Promise.allSettled(tasks.map((task) => task.load()));
    if (signal?.aborted) throw settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    const fulfilled = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const unavailableProviders = [...new Set(settled.flatMap((result, index) => result.status === 'rejected' ? [tasks[index].provider] : []))];
    if (!fulfilled.length && settled.some((result) => result.status === 'rejected')) {
      const reason = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
      if (reason instanceof Error) throw reason;
      throw new CatalogError(tasks[0].provider, 'network');
    }
    return { items: mergeCatalogResults(fulfilled), unavailableProviders };
  }

  async getMedia(identity: MediaIdentity, signal?: AbortSignal): Promise<CatalogMedia> {
    if (!isProviderIdentity(identity)) throw new CatalogError(identity.provider, 'not_found', 404);
    const id = numericId(identity);
    if (identity.provider === 'anilist') return mapAniListAnime(await anilistClient.getAnime(id, signal));
    if (identity.mediaType === 'movie') return mapTmdbMovie(await tmdbClient.getMovie(identity.providerId, signal));
    return mapTmdbTv(await tmdbClient.getTv(identity.providerId, signal));
  }

  async getSeason(identity: MediaIdentity, seasonNumber: number, signal?: AbortSignal): Promise<CatalogSeason> {
    if (identity.provider !== 'tmdb' || identity.mediaType !== 'series' || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0) {
      throw new CatalogError(identity.provider, 'metadata_unavailable');
    }
    numericId(identity);
    const season = await tmdbClient.getSeason(identity.providerId, seasonNumber, signal);
    return mapTmdbSeason(season, identity);
  }

  async getTrending(signal?: AbortSignal): Promise<CatalogMedia[]> {
    const settled = await Promise.allSettled([
      tmdbClient.trendingMovies(signal).then((response) => response.results.map(mapTmdbMovie)),
      tmdbClient.trendingTv(signal).then((response) => response.results.map(mapTmdbTv)),
      anilistClient.trendingAnime(signal).then((media) => media.map(mapAniListAnime)),
    ]);
    if (signal?.aborted) throw settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    const fulfilled = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!fulfilled.length) {
      const reason = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
      if (reason instanceof Error) throw reason;
      throw new CatalogError('tmdb', 'network');
    }
    return interleaveRanked(fulfilled);
  }

  async getRecentlyReleased(signal?: AbortSignal): Promise<CatalogMedia[]> {
    const settled = await Promise.allSettled([
      tmdbClient.nowPlayingMovies(signal).then((response) => response.results.map(mapTmdbMovie)),
      tmdbClient.onTheAirTv(signal).then((response) => response.results.map(mapTmdbTv)),
    ]);
    if (signal?.aborted) throw settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
    const fulfilled = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!fulfilled.length) {
      const reason = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
      if (reason instanceof Error) throw reason;
      throw new CatalogError('tmdb', 'network');
    }
    return orderByRecency(fulfilled.flat());
  }
}

export const catalogRepository: CatalogRepositoryContract = new RemoteCatalogRepository();
