const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'] as const;
const LONG_MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'] as const;

function parseDate(value: string): Date | undefined {
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** "just now" · "5m ago" · "3h ago" · "4 days ago" · "25 Sept 2026". Never throws. */
export function timeAgo(iso: string | undefined, now = new Date()): string {
  if (!iso) return '';
  const date = parseDate(iso);
  if (!date) return '';
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "2026-10" grouping key, or '' when the date is missing/invalid. */
export function monthGroupKey(iso: string | undefined): string {
  if (!iso) return '';
  const date = parseDate(iso);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "OCTOBER 2026" header label for a monthGroupKey. */
export function monthGroupLabel(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return 'EARLIER';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return 'EARLIER';
  return `${LONG_MONTHS[month - 1]} ${match[1]}`;
}

export interface MonthGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Newest month first; undated items land in a trailing "EARLIER" group. */
export function groupByMonth<T>(items: readonly T[], getIso: (item: T) => string | undefined): MonthGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = monthGroupKey(getIso(item));
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a < b ? 1 : -1;
    })
    .map(([key, groupItems]) => ({ key: key || 'undated', label: monthGroupLabel(key), items: groupItems }));
}
