import { useQuery } from '@tanstack/react-query';
import type { CatalogFilter, MediaIdentity } from '@/domain/models/media';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';

export function useCatalogSearch(query: string, filter: CatalogFilter, enabled: boolean) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['catalog', 'search', normalized, filter] as const,
    queryFn: ({ signal }) => catalogRepository.search(normalized, filter, signal),
    enabled: enabled && normalized.length > 0,
    // Keep recent searches warm; the screen-level 320ms debounce plus
    // `enabled` gating already prevents request storms and stale replacement.
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useCatalogMedia(identity: MediaIdentity | undefined) {
  return useQuery({
    queryKey: identity ? ['catalog', identity.provider, identity.mediaType, identity.providerId] as const : ['catalog', 'invalid'],
    queryFn: ({ signal }) => identity ? catalogRepository.getMedia(identity, signal) : Promise.reject(new Error('Invalid media identity')),
    enabled: Boolean(identity),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useCatalogSeason(identity: MediaIdentity | undefined, seasonNumber: number | undefined) {
  return useQuery({
    queryKey: identity && seasonNumber !== undefined ? ['catalog', 'tmdb', 'series', identity.providerId, 'season', seasonNumber] as const : ['catalog', 'season', 'disabled'],
    queryFn: ({ signal }) => identity && seasonNumber !== undefined ? catalogRepository.getSeason(identity, seasonNumber, signal) : Promise.reject(new Error('Invalid season identity')),
    enabled: Boolean(identity && seasonNumber !== undefined && identity.provider === 'tmdb' && identity.mediaType === 'series'),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}
