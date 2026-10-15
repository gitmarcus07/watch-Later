import { useQuery } from '@tanstack/react-query';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { mediaId } from '@/features/catalog/mediaIdentity';
import type { LibraryStatus } from '@/domain/models/watchState';
import type { FranchiseItem } from '@/domain/models/franchise';
import { franchiseItemRouteId } from './catalog';

/**
 * Watched/watchlist flags for every member of a franchise, keyed by media
 * route id (`tmdb:movie:603`) so cards can look themselves up directly.
 * One disk read for the whole grid.
 */
export function useFranchiseStatuses(items: readonly FranchiseItem[]) {
  const identities = items.map((item) => ({
    provider: item.provider,
    mediaType: item.mediaType,
    providerId: item.providerId,
  }));
  const key = items.map(franchiseItemRouteId).sort().join('|');
  return useQuery({
    queryKey: ['watch', 'franchise-statuses', key],
    queryFn: async (): Promise<Record<string, LibraryStatus>> => {
      const statuses = await watchStateRepository.getLibraryStatuses(identities);
      const byRouteId: Record<string, LibraryStatus> = {};
      for (const item of items) byRouteId[franchiseItemRouteId(item)] = statuses[mediaId({ provider: item.provider, mediaType: item.mediaType, providerId: item.providerId })];
      return byRouteId;
    },
    enabled: items.length > 0,
    staleTime: 30_000,
  });
}
