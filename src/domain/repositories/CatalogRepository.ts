import type { CatalogFilter, CatalogMedia, CatalogSeason, CatalogSearchResult, MediaIdentity } from '@/domain/models/media';

export interface CatalogRepository {
  search(query: string, filter: CatalogFilter, signal?: AbortSignal): Promise<CatalogSearchResult>;
  getMedia(identity: MediaIdentity, signal?: AbortSignal): Promise<CatalogMedia>;
  getSeason(identity: MediaIdentity, seasonNumber: number, signal?: AbortSignal): Promise<CatalogSeason>;
}
