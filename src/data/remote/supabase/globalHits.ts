import { supabase } from './client';
import type { HitReport, HitReportItem, HitsMediaType } from '@/features/hits/types';
import type { HitsPeriodType } from '@/features/hits/period';

interface HitReportRow {
  period_type: string;
  period_key: string;
  generated_at: string;
  retrieved_at: string;
  methodology: string;
  status: string;
  movie_items: unknown;
  series_items: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toReportItem(value: unknown, mediaType: HitsMediaType): HitReportItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.rank !== 'number' || typeof value.tmdbId !== 'number' || typeof value.title !== 'string') return null;
  if (typeof value.releaseDate !== 'string') return null;
  return {
    rank: value.rank,
    tmdbId: value.tmdbId,
    mediaType,
    title: value.title,
    posterPath: typeof value.posterPath === 'string' ? value.posterPath : undefined,
    releaseDate: value.releaseDate,
    popularity: typeof value.popularity === 'number' ? value.popularity : null,
    voteAverage: typeof value.voteAverage === 'number' ? value.voteAverage : null,
    voteCount: typeof value.voteCount === 'number' ? value.voteCount : null,
  };
}

function toHitReport(row: HitReportRow): HitReport | null {
  if (row.status !== 'published') return null;
  if (row.period_type !== 'month' && row.period_type !== 'year') return null;
  const type = row.period_type as HitsPeriodType;
  const movies = Array.isArray(row.movie_items)
    ? row.movie_items.map((item) => toReportItem(item, 'movie')).filter((item): item is HitReportItem => item !== null)
    : null;
  const series = Array.isArray(row.series_items)
    ? row.series_items.map((item) => toReportItem(item, 'series')).filter((item): item is HitReportItem => item !== null)
    : null;
  if (!movies || !series) return null;
  return {
    periodType: type,
    periodKey: row.period_key,
    generatedAt: row.generated_at,
    retrievedAt: row.retrieved_at,
    methodology: row.methodology,
    status: 'published',
    movies,
    series,
  };
}

/** Newest published reports first. Empty when unconfigured/offline. */
export async function fetchHitReports(limit = 36): Promise<HitReport[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('global_hit_reports')
      .select('period_type,period_key,generated_at,retrieved_at,methodology,status,movie_items,series_items')
      .eq('status', 'published')
      .order('period_key', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error || !data) return [];
    return (data as HitReportRow[]).map(toHitReport).filter((report): report is HitReport => report !== null);
  } catch {
    return [];
  }
}

export async function fetchHitReport(type: HitsPeriodType, key: string): Promise<HitReport | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('global_hit_reports')
      .select('period_type,period_key,generated_at,retrieved_at,methodology,status,movie_items,series_items')
      .eq('status', 'published')
      .eq('period_type', type)
      .eq('period_key', key)
      .maybeSingle();
    if (error || !data) return null;
    return toHitReport(data as HitReportRow);
  } catch {
    return null;
  }
}
