import type { MediaIdentity } from '@/domain/models/media';
import type { NewOttReleaseRecord, OttReleaseFilter, OttReleaseRecord } from '@/domain/models/ottRelease';

export interface OttReleaseRepository {
  /** Verified stored records for one title in a country (default `IN`). */
  getForMedia(identity: MediaIdentity, country?: string): Promise<OttReleaseRecord[]>;
  /** Verified stored records with platform/status/search filters. */
  list(filter?: OttReleaseFilter): Promise<OttReleaseRecord[]>;
  /**
   * Admin-only write path. Client callers must refuse when `isAdmin` is
   * false — the Supabase RLS policy independently rejects such writes.
   */
  upsert(record: NewOttReleaseRecord, options?: { isAdmin?: boolean }): Promise<OttReleaseRecord>;
  /** Deduplicated cache refresh after a successful remote fetch. */
  replaceCache(records: OttReleaseRecord[]): Promise<void>;
}
