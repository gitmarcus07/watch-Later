/**
 * Global Hits calendar periods.
 *
 * Monthly keys look like `2026-08`, yearly keys like `2026`. Ranges are exact
 * calendar bounds in UTC (`YYYY-MM-DD`), leap-year aware. Everything here is
 * pure and fully unit-tested — the edge function mirrors these rules.
 */

export type HitsPeriodType = 'month' | 'year';

export interface HitsPeriod {
  type: HitsPeriodType;
  key: string;
  from: string;
  to: string;
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_KEY = /^(\d{4})$/;
export const MIN_HITS_YEAR = 1970;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function currentYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

/** Validates a period key and expands it to exact calendar bounds. Null when invalid, out of range, or in the future. */
export function parseHitsPeriod(type: HitsPeriodType, key: string, now: Date = new Date()): HitsPeriod | null {
  const maxYear = currentYear(now);
  if (type === 'month') {
    const match = MONTH_KEY.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < MIN_HITS_YEAR || year > maxYear) return null;
    const from = `${year}-${pad2(month)}-01`;
    const to = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
    if (from > toIsoDate(now)) return null;
    return { type, key, from, to };
  }
  const yearMatch = YEAR_KEY.exec(key);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  if (year < MIN_HITS_YEAR || year > maxYear) return null;
  const from = `${year}-01-01`;
  if (from > toIsoDate(now)) return null;
  return { type, key, from, to: `${year}-12-31` };
}

export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** True once the whole period has elapsed (reports for it may be final). */
export function isPeriodComplete(type: HitsPeriodType, key: string, now: Date = new Date()): boolean {
  const period = parseHitsPeriod(type, key, now);
  if (!period) return false;
  return period.to < toIsoDate(now);
}

/** Most recent fully elapsed month, e.g. `2026-09` when now is October. */
export function lastCompletedMonth(now: Date = new Date()): string {
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastMonth = new Date(firstOfThisMonth - 1);
  return `${lastMonth.getUTCFullYear()}-${pad2(lastMonth.getUTCMonth() + 1)}`;
}

/** Most recent fully elapsed year, e.g. `2025` during 2026. */
export function lastCompletedYear(now: Date = new Date()): number {
  return now.getUTCFullYear() - 1;
}

/**
 * What the scheduler owes: the last completed month plus, in January, the
 * last completed year — minus anything already published. Pure duplicate-job
 * guard: running twice with the same published set yields nothing new.
 */
export function dueReportTargets(published: Set<string>, now: Date = new Date()): { type: HitsPeriodType; key: string }[] {
  const due: { type: HitsPeriodType; key: string }[] = [];
  const monthKey = lastCompletedMonth(now);
  if (!published.has(`month:${monthKey}`)) due.push({ type: 'month', key: monthKey });
  if (now.getUTCMonth() === 0) {
    const yearKey = String(lastCompletedYear(now));
    if (!published.has(`year:${yearKey}`)) due.push({ type: 'year', key: yearKey });
  }
  return due;
}

export function periodLabel(type: HitsPeriodType, key: string): string {  if (type === 'year') return key;
  const month = Number(key.slice(5, 7));
  const year = key.slice(0, 4);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[month - 1] ?? ''} ${year}`.trim();
}

/** First day new data may exist for an incomplete period's final report. */
export function publicationDate(type: HitsPeriodType, key: string): string | null {
  const period = parseHitsPeriod(type, key);
  if (!period) return null;
  const end = new Date(`${period.to}T00:00:00Z`);
  const next = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
  return toIsoDate(next);
}

/** Whole days until the final report for an incomplete period. Null when complete or invalid. */
export function daysUntilPublication(type: HitsPeriodType, key: string, now: Date = new Date()): number | null {
  const published = publicationDate(type, key);
  if (!published) return null;
  if (isPeriodComplete(type, key, now)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.parse(`${published}T00:00:00Z`);
  return Math.max(0, Math.round((target - today) / 86_400_000));
}

/** Step a month key by whole months (year rollover included). Null when invalid. */
export function shiftMonthKey(key: string, delta: number): string | null {
  const match = MONTH_KEY.exec(key);
  if (!match) return null;
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`;
}

/** Step a year key by whole years. Null when invalid. */
export function shiftYearKey(key: string, delta: number): string | null {
  if (!YEAR_KEY.exec(key)) return null;
  return String(Number(key) + delta);
}
