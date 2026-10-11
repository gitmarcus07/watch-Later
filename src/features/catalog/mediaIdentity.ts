import type { CatalogMedia, CatalogMediaType, MediaIdentity, MediaProvider } from '@/domain/models/media';

export function mediaId(identity: MediaIdentity): string {
  return `${identity.provider}:${identity.mediaType}:${encodeURIComponent(identity.providerId)}`;
}

export function mediaRouteId(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId'>): string {
  return mediaId(media);
}

export function parseMediaRouteId(value: string): MediaIdentity | undefined {
  const [provider, mediaType, ...rest] = value.split(':');
  if ((provider !== 'tmdb' && provider !== 'anilist' && provider !== 'tvdb') || !rest.length) return undefined;
  if (mediaType !== 'movie' && mediaType !== 'series' && mediaType !== 'anime') return undefined;
  const providerId = (() => {
    try {
      return decodeURIComponent(rest.join(':'));
    } catch {
      return undefined;
    }
  })();
  if (providerId === undefined || !providerId) return undefined;
  // Custom local entries are stored under the tmdb provider with a
  // `custom-` id, including custom anime titles. Those must always parse
  // so the detail screen can fall back to the local SQLite snapshot.
  const isCustomEntry = providerId.startsWith('custom-');
  if (!isCustomEntry) {
    if ((provider === 'anilist' && mediaType !== 'anime') || (provider === 'tmdb' && mediaType === 'anime')) return undefined;
  }
  return { provider: provider as MediaProvider, mediaType: mediaType as CatalogMediaType, providerId };
}
