import { useQuery } from '@tanstack/react-query';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { fetchHitReport, fetchHitReports } from '@/data/remote/supabase/globalHits';
import type { HitsMediaType } from './types';
import type { HitsPeriodType } from './period';

/** Live TMDB popularity preview for one period. Cached to avoid refetching every visit. */
export function useGlobalHitsLive(type: HitsPeriodType, key: string, media: HitsMediaType, enabled = true) {
  return useQuery({
    queryKey: ['hits', 'live', type, key, media] as const,
    queryFn: ({ signal }) => catalogRepository.getGlobalHitsLive(type, key, media, signal),
    enabled,
    // Previews are point-in-time snapshots; half an hour keeps repeat visits
    // cheap while completed months refresh on their own cadence.
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 2,
  });
}

/** Published reports, newest first. Empty when offline or unconfigured. */
export function useHitReports(enabled = true) {
  return useQuery({
    queryKey: ['hits', 'reports'] as const,
    queryFn: () => fetchHitReports(),
    enabled,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
}

export function useHitReport(type: HitsPeriodType, key: string, enabled = true) {
  return useQuery({
    queryKey: ['hits', 'report', type, key] as const,
    queryFn: () => fetchHitReport(type, key),
    enabled,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: 1,
  });
}
