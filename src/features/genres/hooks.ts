import { useInfiniteCatalog } from '@/features/catalog/hooks';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import type { GenrePageKind } from '@/domain/repositories/CatalogRepository';

/**
 * Infinite pages for one genre shelf. The key carries the scope, so switching
 * between All / Movies / Shows / Anime keeps every shelf's pages cached and
 * instantly restorable when the user flips back.
 */
export function useGenrePages(genreId: number, kind: GenrePageKind, enabled = true) {
  return useInfiniteCatalog(
    ['catalog', 'genre', genreId, kind],
    (page, signal) => catalogRepository.getGenrePage(page, genreId, kind, signal),
    enabled,
  );
}
