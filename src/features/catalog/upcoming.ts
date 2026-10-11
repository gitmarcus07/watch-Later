import type { CatalogMedia } from '@/domain/models/media';

export function isUpcoming(media: CatalogMedia, today = new Date()): boolean {
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (media.releaseDate && isFutureReleaseDate(media.releaseDate, start, today.getFullYear())) return true;
  return isUnreleasedStatus(media.status);
}

function isFutureReleaseDate(releaseDate: string, start: string, currentYear: number): boolean {
  // Year-only dates ("2026") compare as plain strings badly against
  // "2026-10-10", so compare the year numerically.
  if (/^\d{4}$/.test(releaseDate)) return Number(releaseDate) > currentYear;
  return releaseDate > start;
}

/** Production statuses that mean "not out yet". Never throws. */
export function isUnreleasedStatus(status?: string | null): boolean {
  const normalized = (status ?? '').toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ').trim();
  return (
    normalized === 'announced' ||
    normalized === 'planned' ||
    normalized === 'in production' ||
    normalized === 'post production' ||
    normalized === 'pilot' ||
    normalized === 'upcoming' ||
    normalized === 'rumored' ||
    normalized === 'not yet released'
  );
}

export function formatInterestedCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Be the first interested';
  if (count < 1000) return `${count} Interested`;
  if (count < 1_000_000) {
    const value = count / 1000;
    return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}K Interested`;
  }
  const value = count / 1_000_000;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')}M Interested`;
}

export function formatReleaseDate(date?: string): string | undefined {
  if (!date) return undefined;
  if (/^\d{4}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function upcomingSubtitle(media: CatalogMedia): string {
  const kind = media.mediaType === 'movie' ? 'Movie' : media.mediaType === 'series' ? 'Series' : 'Anime';
  const label = formatReleaseDate(media.releaseDate);
  if (!label) return kind;
  return `${label} · ${kind}`;
}

export type UpcomingWindow = 'month' | 'soon' | 'all';

export function filterUpcomingByWindow(items: CatalogMedia[], window: UpcomingWindow, today = new Date()): CatalogMedia[] {
  if (window === 'all') return items;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthEnd = new Date(start);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const soonEnd = new Date(start);
  soonEnd.setMonth(soonEnd.getMonth() + 3);
  const end = window === 'month' ? monthEnd : soonEnd;
  return items.filter((media) => {
    if (!media.releaseDate) return window !== 'month';
    const parsed = new Date(`${media.releaseDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed >= start && parsed <= end;
  });
}
