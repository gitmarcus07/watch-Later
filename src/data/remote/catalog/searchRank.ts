import type { CatalogMedia } from '@/domain/models/media';

/** Case-, diacritic-, and punctuation-insensitive title key. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '');
}

/**
 * Loosely normalized text that keeps word boundaries (and drops curly
 * apostrophes), so "the office" can be told apart from "office" position-wise.
 */
function looseSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * How closely a result title matches the typed query:
 * 0 exact title, 1 title starts with the query, 2 query sits on a word
 * boundary, 3 query appears inside a word, 4 no textual match at all.
 */
export function searchMatchTier(title: string, query: string): number {
  const looseQuery = looseSearchText(query);
  if (!looseQuery) return 4;
  if (normalizeSearchText(title) === normalizeSearchText(query)) return 0;
  const looseTitle = looseSearchText(title);
  if (looseTitle.startsWith(looseQuery)) return 1;
  if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(looseQuery)}`, 'u').test(looseTitle)) return 2;
  if (looseTitle.includes(looseQuery)) return 3;
  return 4;
}

/**
 * Best-effort popularity for ranking: normalized title → score (TMDB's own
 * search results, joined by title because TVDB ids differ from TMDB's).
 */
export type SearchPopularity = ReadonlyMap<string, number>;

/**
 * Orders search results so the title the user actually typed — especially the
 * popular one — lands on top: match quality first, popularity inside each
 * match tier, original provider order as the stable tiebreaker. Missing
 * popularity never demotes a better text match; it only settles ties.
 */
export function rankSearchResults(
  items: readonly CatalogMedia[],
  query: string,
  popularity: SearchPopularity = new Map(),
): CatalogMedia[] {
  return items
    .map((media, index) => ({
      media,
      index,
      tier: searchMatchTier(media.title, query),
      score: popularity.get(normalizeSearchText(media.title)) ?? 0,
    }))
    .sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index)
    .map((entry) => entry.media);
}
