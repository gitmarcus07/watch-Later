import type { NewOttReleaseRecord, OttDatePrecision, OttReleaseRecord, OttReleaseStatus } from '@/domain/models/ottRelease';
import type { MediaIdentity } from '@/domain/models/media';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const OTT_STATUS_LABELS: Record<OttReleaseStatus, string> = {
  confirmed: 'Confirmed release date',
  expected: 'Expected release date',
  window_announced: 'Release window announced',
  platform_announced: 'OTT platform announced',
  unannounced: 'Release date not announced',
  released: 'Available now',
};

/** Short badge text for cards and filters. */
export function ottStatusBadge(status: OttReleaseStatus): string {
  switch (status) {
    case 'confirmed': return 'Confirmed';
    case 'expected': return 'Expected';
    case 'window_announced': return 'Window announced';
    case 'platform_announced': return 'Platform announced';
    case 'unannounced': return 'Date TBA';
    case 'released': return 'Streaming now';
  }
}

/**
 * Formats an OTT date at its announced precision. Month (`2026-11`) and
 * year (`2026`) windows never gain an invented day.
 */
export function formatOttDate(date: string | undefined, precision: OttDatePrecision): string | undefined {
  if (!date) return undefined;
  if (precision === 'unknown') return undefined;
  if (precision === 'year') {
    const match = /^(\d{4})/.exec(date);
    return match ? match[1] : undefined;
  }
  if (precision === 'month') {
    const match = /^(\d{4})-(\d{2})/.exec(date);
    if (!match) return undefined;
    const month = Number(match[2]);
    if (month < 1 || month > 12) return undefined;
    return `${MONTH_NAMES[month - 1]} ${match[1]}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return undefined;
  const day = Number(match[3]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const parsed = new Date(Number(match[1]), month - 1, day);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES[month - 1]} ${match[1]}`;
}

export function formatTheatricalDate(date: string | undefined): string | undefined {
  if (!date) return undefined;
  if (/^\d{4}$/.test(date)) return date;
  return formatOttDate(date, 'exact') ?? undefined;
}

/** Sort key: exact dates first (oldest first), then month/year windows, unknowns last. */
export function ottSortKey(record: OttReleaseRecord): string {
  if (!record.ottReleaseDate || record.datePrecision === 'unknown') return '9999';
  if (record.datePrecision === 'exact') return record.ottReleaseDate.slice(0, 10);
  if (record.datePrecision === 'month') return `${record.ottReleaseDate.slice(0, 7)}-99`;
  return `${record.ottReleaseDate.slice(0, 4)}-99-99`;
}

export function compareOttReleases(a: OttReleaseRecord, b: OttReleaseRecord): number {
  return ottSortKey(a).localeCompare(ottSortKey(b));
}

/**
 * Staleness guard: verification older than this is shown as "may be
 * outdated" instead of being silently presented as fresh.
 */
export const OTT_VERIFICATION_STALE_DAYS = 90;

export function isStaleVerification(record: Pick<OttReleaseRecord, 'lastVerifiedAt'>, now: Date = new Date()): boolean {
  const verified = new Date(record.lastVerifiedAt).getTime();
  if (Number.isNaN(verified)) return true;
  return now.getTime() - verified > OTT_VERIFICATION_STALE_DAYS * 24 * 60 * 60 * 1000;
}

export function formatVerificationDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'unverified';
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** Deterministic dedupe key: one row per movie + platform + country + release event. */
export function ottRecordId(input: {
  identity: MediaIdentity;
  platform: string;
  country: string;
  isPremiere?: boolean;
}): string {
  const slot = input.isPremiere === false ? 'additional' : 'premiere';
  return `ott:${input.identity.provider}:${input.identity.mediaType}:${encodeURIComponent(input.identity.providerId)}:${slug(input.platform)}:${input.country.toUpperCase()}:${slot}`;
}

function isValidDate(value: string, precision: OttDatePrecision): boolean {
  if (precision === 'unknown') return false;
  if (precision === 'year') return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
  if (precision === 'month') return /^\d{4}-\d{2}(-\d{2})?$/.test(value);
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface OttValidationError {
  field: string;
  message: string;
}

/**
 * Accuracy gate for verified records. Returns blocking errors; an empty
 * array means the record may be stored. Never invents dates — unknown stays
 * null and `confirmed` requires a source URL.
 */
export function validateOttRecord(record: NewOttReleaseRecord): OttValidationError[] {
  const errors: OttValidationError[] = [];
  if (!record.providerId.trim()) errors.push({ field: 'providerId', message: 'A movie id from the metadata provider is required.' });
  if (!record.movieTitle.trim()) errors.push({ field: 'movieTitle', message: 'A movie title or canonical reference is required.' });
  if (!record.platform.trim()) errors.push({ field: 'platform', message: 'An OTT platform name is required.' });
  if (!/^[A-Z]{2}$/.test(record.country)) errors.push({ field: 'country', message: 'Country must be an ISO 3166-1 alpha-2 code such as IN.' });
  if (record.status === 'confirmed') {
    if (!record.ottReleaseDate || record.datePrecision === 'unknown') {
      errors.push({ field: 'ottReleaseDate', message: 'A confirmed release needs a known date (exact, month, or year).' });
    }
    if (!record.sourceUrl) {
      errors.push({ field: 'sourceUrl', message: 'A confirmed release needs a source URL for the announcement.' });
    }
  }
  if (record.ottReleaseDate) {
    if (record.datePrecision === 'unknown') {
      errors.push({ field: 'datePrecision', message: 'A record with a date must declare its precision (exact, month, or year).' });
    } else if (!isValidDate(record.ottReleaseDate, record.datePrecision)) {
      errors.push({ field: 'ottReleaseDate', message: 'The OTT date does not match its declared precision.' });
    }
  } else if (record.datePrecision !== 'unknown' && (record.status === 'confirmed' || record.status === 'expected' || record.status === 'window_announced')) {
    errors.push({ field: 'ottReleaseDate', message: 'This status needs at least a month or year window — keep it null only when truly unannounced.' });
  }
  if (record.sourceUrl && !isValidHttpUrl(record.sourceUrl)) {
    errors.push({ field: 'sourceUrl', message: 'The source must be a valid http(s) URL.' });
  }
  if (!record.lastVerifiedAt.trim()) {
    errors.push({ field: 'lastVerifiedAt', message: 'A verification timestamp is required so stale data is never silent.' });
  }
  return errors;
}

export function isOttValidationErrorList(value: unknown): value is OttValidationError[] {
  return Array.isArray(value);
}

export interface OttMemoryFilter {
  country?: string;
  platform?: string;
  status?: OttReleaseStatus | readonly OttReleaseStatus[];
  query?: string;
  scheduledOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Pure in-memory filter + nearest-date sort for verified records. */
export function applyOttFilter(records: OttReleaseRecord[], filter?: OttMemoryFilter): OttReleaseRecord[] {
  if (!filter) return [...records].sort(compareOttReleases);
  const query = filter.query?.trim().toLowerCase();
  const statuses = filter.status === undefined ? undefined : Array.isArray(filter.status) ? filter.status : [filter.status];
  const scoped = records
    .filter((record) => (filter.country ? record.country === filter.country : true))
    .filter((record) => (filter.platform ? record.platform.toLowerCase() === filter.platform.toLowerCase() : true))
    .filter((record) => (statuses ? statuses.includes(record.status) : true))
    .filter((record) => (query ? record.movieTitle.toLowerCase().includes(query) : true))
    .filter((record) => (filter.scheduledOnly ? Boolean(record.ottReleaseDate) && record.datePrecision !== 'unknown' : true))
    .sort(compareOttReleases);
  const offset = Math.max(0, filter.offset ?? 0);
  return scoped.slice(offset, offset + (filter.limit ?? scoped.length));
}
