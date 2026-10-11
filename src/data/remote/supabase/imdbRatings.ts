import { supabase } from './client';

export interface ImdbTopItem {
  rank: number;
  tmdbId: number;
  mediaType: 'movie' | 'series';
  imdbId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  rating: number;
  votes: number;
}

interface ImdbRatingRow {
  tmdb_id: number;
  media_type: string;
  imdb_id: string;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number;
  votes: number;
  list_rank: number | null;
}

/** Validates one snapshot row. Null when malformed — never show a broken rank. */
export function mapImdbRow(row: ImdbRatingRow): ImdbTopItem | null {
  if (!Number.isSafeInteger(row.tmdb_id)) return null;
  if (row.media_type !== 'movie' && row.media_type !== 'series') return null;
  if (typeof row.imdb_id !== 'string' || !row.imdb_id) return null;
  if (typeof row.title !== 'string' || !row.title) return null;
  if (typeof row.rating !== 'number' || !Number.isFinite(row.rating)) return null;
  if (typeof row.votes !== 'number' || !Number.isFinite(row.votes)) return null;
  if (!Number.isSafeInteger(row.list_rank) || (row.list_rank ?? 0) < 1) return null;
  const rank = row.list_rank ?? 0;
  return {
    rank,
    tmdbId: row.tmdb_id,
    mediaType: row.media_type,
    imdbId: row.imdb_id,
    title: row.title,
    year: typeof row.year === 'number' ? row.year : undefined,
    posterUrl: typeof row.poster_url === 'string' && row.poster_url ? row.poster_url : undefined,
    rating: row.rating,
    votes: row.votes,
  };
}

/** Weekly IMDb Top 250 snapshot, rank order. Empty when offline/unconfigured. */
export async function fetchImdbTop(mediaType: 'movie' | 'series', limit = 250): Promise<ImdbTopItem[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('imdb_ratings')
      .select('tmdb_id,media_type,imdb_id,title,year,poster_url,rating,votes,list_rank')
      .eq('media_type', mediaType)
      .gte('list_rank', 1)
      .order('list_rank', { ascending: true })
      .limit(Math.max(1, Math.min(limit, 250)));
    if (error || !data) return [];
    return (data as ImdbRatingRow[]).map(mapImdbRow).filter((item): item is ImdbTopItem => item !== null);
  } catch {
    return [];
  }
}

export interface ImdbRating {
  rating: number;
  votes: number;
}

/** Validates a rating-only row (unranked recent snapshots included). */
export function mapImdbRating(row: Pick<ImdbRatingRow, 'rating' | 'votes'>): ImdbRating | null {
  if (typeof row.rating !== 'number' || !Number.isFinite(row.rating)) return null;
  if (typeof row.votes !== 'number' || !Number.isFinite(row.votes)) return null;
  return { rating: row.rating, votes: row.votes };
}

/** Batch IMDb scores for displayed titles, keyed `mediaType:tmdbId`. Never throws. */
export async function fetchImdbRatingsFor(items: { tmdbId: number; mediaType: 'movie' | 'series' }[]): Promise<Map<string, ImdbRating>> {
  const result = new Map<string, ImdbRating>();
  const client = supabase;
  if (!client || !items.length) return result;
  try {
    const byType = new Map<'movie' | 'series', number[]>();
    for (const item of items) {
      const list = byType.get(item.mediaType) ?? [];
      if (!list.includes(item.tmdbId)) list.push(item.tmdbId);
      byType.set(item.mediaType, list);
    }
    const responses = await Promise.all(
      [...byType.entries()].map(([mediaType, ids]) =>
        client
          .from('imdb_ratings')
          .select('tmdb_id,media_type,rating,votes')
          .eq('media_type', mediaType)
          .in('tmdb_id', ids.slice(0, 100)),
      ),
    );
    for (const [index, response] of responses.entries()) {
      const mediaType = [...byType.keys()][index];
      if (response.error || !response.data) continue;
      for (const row of response.data as Pick<ImdbRatingRow, 'tmdb_id' | 'rating' | 'votes'>[]) {
        const rating = mapImdbRating(row);
        if (rating && Number.isSafeInteger(row.tmdb_id)) result.set(`${mediaType}:${row.tmdb_id}`, rating);
      }
    }
  } catch {
    // Ratings are decoration: the list renders without them.
  }
  return result;
}
