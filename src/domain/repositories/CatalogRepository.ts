import type { CatalogFilter, CatalogMedia, CatalogSeason, CatalogSearchResult, MediaIdentity } from '@/domain/models/media';

export interface CatalogRepository {
  search(query: string, filter: CatalogFilter, signal?: AbortSignal): Promise<CatalogSearchResult>;
  getMedia(identity: MediaIdentity, signal?: AbortSignal): Promise<CatalogMedia>;
  getSeason(identity: MediaIdentity, seasonNumber: number, signal?: AbortSignal): Promise<CatalogSeason>;
  /** Live ranked discovery: current trending movies, series, and anime. */
  getTrending(signal?: AbortSignal): Promise<CatalogMedia[]>;
  /** Live discovery: recently released movies and currently airing series. */
  getRecentlyReleased(signal?: AbortSignal): Promise<CatalogMedia[]>;
}
