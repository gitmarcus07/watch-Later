import type { HitsMediaType, RankedHit } from './ranking';
import type { HitsPeriodType } from './period';

/** One ranked entry, as stored in published reports and served by live previews. */
export type HitReportItem = RankedHit;

/** A published monthly/yearly report (Supabase row shape). */
export interface HitReport {
  periodType: HitsPeriodType;
  periodKey: string;
  generatedAt: string;
  retrievedAt: string;
  methodology: string;
  status: 'published';
  movies: HitReportItem[];
  series: HitReportItem[];
}

/** A clearly-labelled live preview for a period (final only once complete). */
export interface GlobalHitsLive {
  periodType: HitsPeriodType;
  periodKey: string;
  from: string;
  to: string;
  complete: boolean;
  retrievedAt: string;
  items: HitReportItem[];
}

export type { HitsMediaType, HitsPeriodType };
