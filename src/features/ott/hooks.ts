import { useQuery } from '@tanstack/react-query';
import type { CatalogMedia, MediaIdentity } from '@/domain/models/media';
import type { OttReleaseStatus } from '@/domain/models/ottRelease';
import { getOttForMedia, listOttReleases } from '@/features/ott/OttReleaseService';
import { OTT_DEFAULT_COUNTRY } from '@/features/ott/platforms';

export function useOttForMedia(media: CatalogMedia | null | undefined, country: string = OTT_DEFAULT_COUNTRY) {
  const identity: MediaIdentity | undefined = media
    ? { provider: media.provider, mediaType: media.mediaType, providerId: media.providerId }
    : undefined;
  return useQuery({
    queryKey: identity ? ['ott', 'media', identity.provider, identity.mediaType, identity.providerId, country] as const : ['ott', 'media', 'none'],
    queryFn: ({ signal }) => getOttForMedia(media!, identity!, country, signal),
    enabled: Boolean(media && identity),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

export interface UpcomingOttOptions {
  platform?: string;
  status?: OttReleaseStatus | readonly OttReleaseStatus[];
  query?: string;
  /** 'upcoming' excludes undated records; 'tba' shows only undated ones. */
  tab?: 'upcoming' | 'released' | 'tba' | 'all';
  limit?: number;
  offset?: number;
}

const TAB_STATUS: Record<NonNullable<UpcomingOttOptions['tab']>, OttReleaseStatus[] | undefined> = {
  upcoming: ['confirmed', 'expected', 'window_announced'],
  released: ['released'],
  tba: ['unannounced', 'platform_announced'],
  all: undefined,
};

export function useUpcomingOttReleases(options: UpcomingOttOptions = {}, country: string = OTT_DEFAULT_COUNTRY) {
  const tab = options.tab ?? 'upcoming';
  const status = options.status ?? TAB_STATUS[tab];
  const key = ['ott', 'upcoming', country, tab, options.platform ?? '', options.query ?? '', options.limit ?? 100, options.offset ?? 0] as const;
  return useQuery({
    queryKey: key,
    queryFn: () =>
      listOttReleases({
        country,
        platform: options.platform,
        status,
        query: options.query,
        scheduledOnly: tab === 'upcoming',
        limit: options.limit ?? 100,
        offset: options.offset ?? 0,
      }),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    placeholderData: (previous) => previous,
  });
}
