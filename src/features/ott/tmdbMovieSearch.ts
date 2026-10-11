import { tmdbClient } from '@/data/remote/tmdb/client';

export interface TmdbMovieChoice {
  tmdbId: string;
  title: string;
  releaseDate?: string;
}

/**
 * Admin movie lookup: resolves a REAL TMDB id so records always point at a
 * title the detail screen can actually open. Never throws for empty queries.
 */
export async function searchTmdbMovies(query: string, signal?: AbortSignal): Promise<TmdbMovieChoice[]> {
  const term = query.trim();
  if (!term) return [];
  const response = await tmdbClient.searchMovies(term, signal);
  return (response.results ?? []).slice(0, 8).map((movie) => ({
    tmdbId: String(movie.id),
    title: movie.title,
    releaseDate: movie.release_date || undefined,
  }));
}
