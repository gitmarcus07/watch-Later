/**
 * Global Hits ranking (methodology `tmdb-popularity-v1`).
 *
 * Candidates are filtered to titles whose qualifying release date is a real
 * calendar date inside the period (inclusive), then ranked by TMDB popularity
 * descending. Movies and series are ranked separately by their own date
 * field. Pure and fully unit-tested — the edge function mirrors these rules.
 */

export const HITS_METHODOLOGY = 'tmdb-popularity-v1';
export const HITS_TOP_N = 20;
export const HITS_MAX_PAGES = 5;

export type HitsMediaType = 'movie' | 'series';

export interface HitCandidate {
  tmdbId: number;
  mediaType: HitsMediaType;
  title: string;
  posterPath?: string | null;
  /** Qualifying date: release_date (movies) or first_air_date (series). */
  date?: string | null;
  popularity?: number | null;
  voteAverage?: number | null;
  voteCount?: number | null;
}

export interface RankedHit {
  rank: number;
  tmdbId: number;
  mediaType: HitsMediaType;
  title: string;
  posterPath?: string | null;
  releaseDate: string;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for real calendar dates (rejects `2026-02-30`, partial years, datetimes). */
export function isValidCalendarDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days;
}

export interface RankingInput {
  from: string;
  to: string;
  limit?: number;
}

/**
 * Filters out missing/invalid/out-of-range dates, sorts the survivors by
 * TMDB popularity descending (unknown popularity sinks to the bottom), and
 * assigns stable 1-based ranks up to `limit`.
 */
export function buildHitsRanking(candidates: HitCandidate[], input: RankingInput): RankedHit[] {
  const limit = input.limit ?? HITS_TOP_N;
  const eligible = candidates.filter(
    (candidate): candidate is HitCandidate & { date: string } =>
      isValidCalendarDate(candidate.date) && candidate.date >= input.from && candidate.date <= input.to,
  );
  const ordered = [...eligible].sort((a, b) => (b.popularity ?? Number.NEGATIVE_INFINITY) - (a.popularity ?? Number.NEGATIVE_INFINITY));
  return ordered.slice(0, Math.max(0, limit)).map((candidate, index) => ({
    rank: index + 1,
    tmdbId: candidate.tmdbId,
    mediaType: candidate.mediaType,
    title: candidate.title,
    posterPath: candidate.posterPath ?? undefined,
    releaseDate: candidate.date,
    popularity: candidate.popularity ?? null,
    voteAverage: candidate.voteAverage ?? null,
    voteCount: candidate.voteCount ?? null,
  }));
}

/** Concatenates fetched pages in order (fetching/caps live with the caller). */
export function mergeHitPages(pages: HitCandidate[][]): HitCandidate[] {
  return pages.flat();
}
