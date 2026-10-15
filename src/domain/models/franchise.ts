import type { CatalogMediaType, MediaProvider } from '@/domain/models/media';

/**
 * One title inside a franchise collection, in editorial (release) order.
 * Identity is enough to route into the existing `/media/[id]` screen; the
 * poster path and year let the grid render instantly with no network call.
 */
export interface FranchiseItem {
  provider: MediaProvider;
  mediaType: CatalogMediaType;
  providerId: string;
  title: string;
  year?: number;
  /** Full ISO release/air date (YYYY-MM-DD); members are stored in this order. */
  releaseDate?: string;
  posterPath?: string | null;
}

/** An ordered, curated collection of related titles (e.g. "The Jurassic Franchise"). */
export interface FranchiseCollection {
  slug: string;
  title: string;
  overview: string;
  /** Wide art for the card/hero — first item's backdrop when one exists. */
  backdropPath?: string | null;
  /** Canonical order: release order of the franchise, movies and shows interleaved. */
  items: FranchiseItem[];
}
