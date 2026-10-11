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
  list_rank: number;
}

/** Validates one snapshot row. Null when malformed — never show a broken rank. */
export function mapImdbRow(row: ImdbRatingRow): ImdbTopItem | null {
  if (!Number.isSafeInteger(row.tmdb_id)) return null;
  if (row.media_type !== 'movie' && row.media_type !== 'series') return null;
  if (typeof row.imdb_id !== 'string' || !row.imdb_id) return null;
  if (typeof row.title !== 'string' || !row.title) return null;
  if (typeof row.rating !== 'number' || !Number.isFinite(row.rating)) return null;
  if (typeof row.votes !== 'number' || !Number.isFinite(row.votes)) return null;
  if (!Number.isSafeInteger(row.list_rank) || row.list_rank < 1) return null;
  return {
    rank: row.list_rank,
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
      .order('list_rank', { ascending: true })
      .limit(Math.max(1, Math.min(limit, 250)));
    if (error || !data) return [];
    return (data as ImdbRatingRow[]).map(mapImdbRow).filter((item): item is ImdbTopItem => item !== null);
  } catch {
    return [];
  }
}
