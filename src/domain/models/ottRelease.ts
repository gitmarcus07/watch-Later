import type { MediaIdentity } from './media';

/**
 * India-first OTT release tracking. Country/region codes are ISO 3166-1
 * alpha-2 (`IN` today); additional countries reuse this exact shape, so
 * future regions need rows — never a rewrite.
 */

export type OttCountryCode = string;

export type OttDatePrecision = 'exact' | 'month' | 'year' | 'unknown';

/**
 * Verified release lifecycle. `confirmed` requires a reliable source;
 * `expected` is an explicit estimate that must never render as confirmed.
 */
export type OttReleaseStatus =
  | 'confirmed'
  | 'expected'
  | 'window_announced'
  | 'platform_announced'
  | 'unannounced'
  | 'released';

export interface OttReleaseRecord extends MediaIdentity {
  /** Stable row id: `ott:<provider>:<mediaType>:<providerId>:<platform>:<country>[:<slot>]`. */
  id: string;
  movieTitle: string;
  platform: string;
  platformLogoUrl?: string;
  /** TMDB watch-provider id when the platform is a known TMDB provider. */
  tmdbProviderId?: number;
  country: OttCountryCode;
  theatricalReleaseDate?: string;
  /** Null unless a verified announcement (or month/year window) exists. Never inferred. */
  ottReleaseDate?: string;
  datePrecision: OttDatePrecision;
  status: OttReleaseStatus;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  lastVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  /** True for the first digital premiere; later platform additions are false. */
  isPremiere: boolean;
}

export type NewOttReleaseRecord = Omit<OttReleaseRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export interface OttReleaseFilter {
  country?: OttCountryCode;
  platform?: string;
  status?: OttReleaseStatus | readonly OttReleaseStatus[];
  /** Case-insensitive title substring. */
  query?: string;
  /** When true, records with unknown dates are excluded (scheduled only). */
  scheduledOnly?: boolean;
  limit?: number;
  offset?: number;
}
