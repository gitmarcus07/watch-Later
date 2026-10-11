export type LibrarySortKey = 'recent' | 'title' | 'year' | 'runtime' | 'rating';

export function stripLeadingArticles(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '');
}

export interface SortableEntry {
  title: string;
  year?: number;
  runtimeMinutes?: number;
  userRating?: number | null;
  addedAt: string;
}

export function sortLibraryEntries<T extends SortableEntry>(entries: readonly T[], key: LibrarySortKey): T[] {
  const ranked = [...entries];
  switch (key) {
    case 'title':
      ranked.sort((a, b) => stripLeadingArticles(a.title).localeCompare(stripLeadingArticles(b.title), undefined, { sensitivity: 'base' }));
      break;
    case 'year':
      ranked.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || stripLeadingArticles(a.title).localeCompare(stripLeadingArticles(b.title), undefined, { sensitivity: 'base' }));
      break;
    case 'runtime':
      ranked.sort((a, b) => (b.runtimeMinutes ?? -1) - (a.runtimeMinutes ?? -1));
      break;
    case 'rating':
      ranked.sort((a, b) => (b.userRating ?? -1) - (a.userRating ?? -1));
      break;
    case 'recent':
    default:
      break;
  }
  return ranked;
}
