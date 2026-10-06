import type { CatalogMedia, CatalogMediaType, MediaIdentity, MediaProvider } from '@/domain/models/media';

export function mediaId(identity: MediaIdentity): string {
  return `${identity.provider}:${identity.mediaType}:${encodeURIComponent(identity.providerId)}`;
}

export function mediaRouteId(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId'>): string {
  return mediaId(media);
}

export function parseMediaRouteId(value: string): MediaIdentity | undefined {
  const [provider, mediaType, ...rest] = value.split(':');
  if ((provider !== 'tmdb' && provider !== 'anilist') || !rest.length) return undefined;
  if (mediaType !== 'movie' && mediaType !== 'series' && mediaType !== 'anime') return undefined;
  if ((provider === 'anilist' && mediaType !== 'anime') || (provider === 'tmdb' && mediaType === 'anime')) return undefined;
  try {
    return { provider: provider as MediaProvider, mediaType: mediaType as CatalogMediaType, providerId: decodeURIComponent(rest.join(':')) };
  } catch {
    return undefined;
  }
}
