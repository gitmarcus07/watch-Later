import { CatalogError } from '@/domain/errors/CatalogError';
import { catalogConfig } from '@/data/remote/catalog/config';
import { requestJson } from '@/data/remote/catalog/request';
import { ANIME_DETAIL_QUERY, ANIME_POPULAR_QUERY, ANIME_SEARCH_QUERY, ANIME_TOP_RATED_QUERY, ANIME_TRENDING_QUERY, ANIME_UPCOMING_PAGE_QUERY } from './queries';
import type { AniListMediaDto, AniListResponse } from './types';

async function query<T>(queryText: string, variables: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const response = await requestJson<AniListResponse>('anilist', catalogConfig.anilistEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: queryText, variables }),
  }, signal);
  if (!response || typeof response !== 'object') throw new CatalogError('anilist', 'invalid_response');
  if (response.errors?.length) throw new CatalogError('anilist', 'graphql');
  return response as T;
}

export const anilistClient = {
  async searchAnime(search: string, signal?: AbortSignal): Promise<AniListMediaDto[]> {
    const response = await query<AniListResponse>(ANIME_SEARCH_QUERY, { search }, signal);
    const media = response.data?.Page?.media;
    if (!Array.isArray(media)) throw new CatalogError('anilist', 'invalid_response');
    return media.filter((item): item is AniListMediaDto => item !== null && Number.isSafeInteger(item.id));
  },
  async getAnime(id: number, signal?: AbortSignal): Promise<AniListMediaDto> {
    const response = await query<AniListResponse>(ANIME_DETAIL_QUERY, { id }, signal);
    const media = response.data?.Media;
    if (!media) throw new CatalogError('anilist', 'not_found', 404);
    if (!Number.isSafeInteger(media.id)) throw new CatalogError('anilist', 'invalid_response');
    return media;
  },
  async trendingAnime(signal?: AbortSignal): Promise<AniListMediaDto[]> {
    const response = await query<AniListResponse>(ANIME_TRENDING_QUERY, {}, signal);
    const media = response.data?.Page?.media;
    if (!Array.isArray(media)) throw new CatalogError('anilist', 'invalid_response');
    return media.filter((item): item is AniListMediaDto => item !== null && Number.isSafeInteger(item.id));
  },
  async upcomingAnime(signal?: AbortSignal): Promise<AniListMediaDto[]> {
    const page = await anilistClient.upcomingAnimePage(1, 15, signal);
    return page.media;
  },
  async upcomingAnimePage(page = 1, perPage = 20, signal?: AbortSignal): Promise<{ media: AniListMediaDto[]; hasNextPage: boolean; lastPage?: number }> {
    const response = await query<AniListResponse>(ANIME_UPCOMING_PAGE_QUERY, { page, perPage }, signal);
    const pageData = response.data?.Page;
    if (!Array.isArray(pageData?.media)) throw new CatalogError('anilist', 'invalid_response');
    return {
      media: pageData.media.filter((item): item is AniListMediaDto => item !== null && Number.isSafeInteger(item.id)),
      hasNextPage: pageData.pageInfo?.hasNextPage ?? false,
      lastPage: pageData.pageInfo?.lastPage ?? undefined,
    };
  },
  async popularAnime(page = 1, perPage = 24, signal?: AbortSignal): Promise<{ media: AniListMediaDto[]; hasNextPage: boolean; lastPage?: number }> {
    const response = await query<AniListResponse>(ANIME_POPULAR_QUERY, { page, perPage }, signal);
    const pageData = response.data?.Page;
    if (!Array.isArray(pageData?.media)) throw new CatalogError('anilist', 'invalid_response');
    return {
      media: pageData.media.filter((item): item is AniListMediaDto => item !== null && Number.isSafeInteger(item.id)),
      hasNextPage: pageData.pageInfo?.hasNextPage ?? false,
      lastPage: pageData.pageInfo?.lastPage ?? undefined,
    };
  },
  async topRatedAnime(page = 1, perPage = 25, signal?: AbortSignal): Promise<{ media: AniListMediaDto[]; hasNextPage: boolean; lastPage?: number }> {
    const response = await query<AniListResponse>(ANIME_TOP_RATED_QUERY, { page, perPage }, signal);
    const pageData = response.data?.Page;
    if (!Array.isArray(pageData?.media)) throw new CatalogError('anilist', 'invalid_response');
    return {
      media: pageData.media.filter((item): item is AniListMediaDto => item !== null && Number.isSafeInteger(item.id)),
      hasNextPage: pageData.pageInfo?.hasNextPage ?? false,
      lastPage: pageData.pageInfo?.lastPage ?? undefined,
    };
  },
};
