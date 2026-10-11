import { CatalogError } from '@/domain/errors/CatalogError';
import { requestJson } from '@/data/remote/catalog/request';
import type { JikanEpisodeDto, JikanEpisodesResponse } from './types';

const JIKAN_BASE = process.env.EXPO_PUBLIC_JIKAN_BASE ?? 'https://api.jikan.moe/v4';

/** Jikan enforces ~3 req/s. Sequential page fetches stay well under that. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function episodesUrl(malId: number, page: number): string {
  return `${JIKAN_BASE.replace(/\/$/, '')}/anime/${malId}/episodes?page=${page}`;
}

export interface JikanEpisode {
  number: number;
  title: string;
  aired?: string;
  synopsis?: string;
  filler?: boolean;
  recap?: boolean;
}

function normalizeEpisode(dto: JikanEpisodeDto, fallbackNumber: number): JikanEpisode | null {
  const rawNumber = typeof dto?.episode === 'number' ? dto.episode : Number(dto?.episode);
  const number = Number.isSafeInteger(rawNumber) && (rawNumber as number) > 0 ? (rawNumber as number) : fallbackNumber;
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return {
    number,
    title: dto?.title?.trim() || `Episode ${number}`,
    aired: dto?.aired ? String(dto.aired).slice(0, 10) : undefined,
    synopsis: dto?.synopsis?.trim() || undefined,
    filler: dto?.filler ?? undefined,
    recap: dto?.recap ?? undefined,
  };
}

export const jikanClient = {
  /** Single page of episodes for a MyAnimeList anime id. Throws CatalogError on failure. */
  async getEpisodePage(malId: number, page: number, signal?: AbortSignal): Promise<{ episodes: JikanEpisode[]; hasNextPage: boolean; lastPage: number }> {
    if (!Number.isSafeInteger(malId) || malId < 1) throw new CatalogError('anilist', 'not_found', 404);
    const response = await requestJson<JikanEpisodesResponse>('anilist', episodesUrl(malId, Math.max(1, page)), {}, signal);
    if (!response || !Array.isArray(response.data)) throw new CatalogError('anilist', 'invalid_response');
    const episodes = response.data
      .map((dto, index) => normalizeEpisode(dto, index + 1 + (Math.max(1, page) - 1) * 100))
      .filter((episode): episode is JikanEpisode => episode !== null);
    return {
      episodes,
      hasNextPage: response.pagination?.has_next_page ?? false,
      lastPage: response.pagination?.last_visible_page ?? 1,
    };
  },

  /**
   * Every episode for a MyAnimeList anime id, oldest first. Pages are fetched
   * sequentially to respect Jikan's rate limit; capped so runaway series
   * (1000+ episodes) can't loop the provider.
   */
  async getAllEpisodes(malId: number, signal?: AbortSignal, maxPages = 12): Promise<JikanEpisode[]> {
    const all: JikanEpisode[] = [];
    let page = 1;
    for (;;) {
      if (page > 1) await sleep(400);
      const result = await jikanClient.getEpisodePage(malId, page, signal);
      all.push(...result.episodes);
      if (!result.hasNextPage || page >= Math.max(1, Math.min(maxPages, result.lastPage || maxPages))) break;
      page += 1;
    }
    const seen = new Set<number>();
    return all
      .filter((episode) => {
        if (seen.has(episode.number)) return false;
        seen.add(episode.number);
        return true;
      })
      .sort((a, b) => a.number - b.number);
  },
};
