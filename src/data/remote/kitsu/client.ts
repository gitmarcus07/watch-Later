import { CatalogError } from '@/domain/errors/CatalogError';
import { requestJson, withQuery } from '@/data/remote/catalog/request';
import type { KitsuEpisodeDto, KitsuEpisodesResponse, KitsuMappingsResponse } from './types';

const KITSU_BASE = process.env.EXPO_PUBLIC_KITSU_BASE ?? 'https://kitsu.io/api/edge';
const PAGE_LIMIT = 20;
/** Cap so runaway long-runners (1000+ episodes) can't loop the provider. */
const MAX_PAGES = 60;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface KitsuEpisode {
  number: number;
  title: string;
  aired?: string;
  synopsis?: string;
  stillUrl?: string;
  runtimeMinutes?: number;
}

/** AniList id → Kitsu anime id. Negative hits are cached too. */
const kitsuIdCache = new Map<number, string | null>();

function normalizeEpisode(dto: KitsuEpisodeDto): KitsuEpisode | null {
  const rawNumber = dto?.attributes?.number;
  const number = typeof rawNumber === 'number' && Number.isSafeInteger(rawNumber) && rawNumber > 0 ? rawNumber : null;
  if (number === null) return null;
  const titles = dto?.attributes?.titles;
  // English first: canonicalTitle is usually romaji, so it must not win
  // over an available English title. Japanese (ja_jp) is the last resort.
  const title =
    titles?.en_us?.trim() ||
    dto?.attributes?.canonicalTitle?.trim() ||
    titles?.en_jp?.trim() ||
    titles?.ja_jp?.trim() ||
    `Episode ${number}`;
  const aired = dto?.attributes?.airdate ? String(dto.attributes.airdate).slice(0, 10) : undefined;
  const runtime = dto?.attributes?.length;
  return {
    number,
    title,
    aired,
    synopsis: dto?.attributes?.synopsis?.trim() || undefined,
    stillUrl: dto?.attributes?.thumbnail?.original || undefined,
    runtimeMinutes: typeof runtime === 'number' && runtime > 0 ? Math.round(runtime) : undefined,
  };
}

export const kitsuClient = {
  /**
   * Resolves an AniList anime id to its Kitsu anime id via Kitsu's public
   * external mappings. Returns null when unmapped. Results are cached for
   * the app session, including misses.
   */
  async resolveAnimeId(anilistId: number, signal?: AbortSignal): Promise<string | null> {
    if (!Number.isSafeInteger(anilistId) || anilistId < 1) return null;
    const cached = kitsuIdCache.get(anilistId);
    if (cached !== undefined) return cached;
    // `include=item` is required: without it the response carries only
    // relationship links and no linkage, so the id would never resolve.
    const url = withQuery(`${KITSU_BASE.replace(/\/$/, '')}/mappings`, {
      'filter[externalSite]': 'anilist/anime',
      'filter[externalId]': anilistId,
      include: 'item',
    });
    const response = await requestJson<KitsuMappingsResponse>('anilist', url, {}, signal);
    const rawId = response?.data?.[0]?.relationships?.item?.data?.id;
    const kitsuId = rawId === undefined || rawId === null ? null : String(rawId);
    kitsuIdCache.set(anilistId, kitsuId || null);
    return kitsuId || null;
  },

  /** One page of a Kitsu anime's episodes, oldest first. Throws CatalogError on failure. */
  async getEpisodePage(kitsuId: string, offset: number, signal?: AbortSignal): Promise<{ episodes: KitsuEpisode[]; total: number }> {
    if (!kitsuId) throw new CatalogError('anilist', 'not_found', 404);
    const url = withQuery(`${KITSU_BASE.replace(/\/$/, '')}/anime/${encodeURIComponent(kitsuId)}/episodes`, {
      'page[limit]': PAGE_LIMIT,
      'page[offset]': Math.max(0, offset),
      sort: 'number',
    });
    const response = await requestJson<KitsuEpisodesResponse>('anilist', url, {}, signal);
    if (!response || !Array.isArray(response.data)) throw new CatalogError('anilist', 'invalid_response');
    return {
      episodes: response.data.map(normalizeEpisode).filter((episode): episode is KitsuEpisode => episode !== null),
      total: typeof response.meta?.count === 'number' ? response.meta.count : 0,
    };
  },

  /**
   * Every episode for a Kitsu anime id, oldest first. Pages are fetched
   * sequentially with a polite pause; capped so runaway series can't loop
   * the provider.
   */
  async getAllEpisodes(kitsuId: string, signal?: AbortSignal): Promise<KitsuEpisode[]> {
    const all: KitsuEpisode[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (page > 0) await sleep(250);
      const result = await kitsuClient.getEpisodePage(kitsuId, offset, signal);
      all.push(...result.episodes);
      offset += PAGE_LIMIT;
      if (result.episodes.length < PAGE_LIMIT) break;
      if (result.total > 0 && offset >= result.total) break;
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

/** Test-only reset for the id cache. */
export function __resetKitsuClientForTests(): void {
  kitsuIdCache.clear();
}
