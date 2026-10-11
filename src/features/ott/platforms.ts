/**
 * Configurable India OTT platform list. This is data, not an assumption:
 * a movie links to a platform only through a verified `OttReleaseRecord`
 * or live TMDB `IN` availability — never because the platform is listed here.
 *
 * `tmdbProviderId` values are TMDB watch-provider ids used to match live
 * `watch/providers` results. They are best-effort and may be extended
 * without touching the UI. Logos are resolved at runtime from TMDB
 * `logo_path` values (live availability) or the verified record's stored
 * `platformLogoUrl` (admin-entered) — never hardcoded here.
 */
export interface OttPlatform {
  name: string;
  tmdbProviderId?: number;
}

export const OTT_DEFAULT_COUNTRY = 'IN';

export const OTT_PLATFORMS: readonly OttPlatform[] = [
  { name: 'Netflix', tmdbProviderId: 8 },
  { name: 'Amazon Prime Video', tmdbProviderId: 119 },
  { name: 'JioHotstar', tmdbProviderId: 122 },
  { name: 'ZEE5', tmdbProviderId: 232 },
  { name: 'SonyLIV', tmdbProviderId: 237 },
  { name: 'Apple TV+', tmdbProviderId: 350 },
];

export function findPlatform(name: string): OttPlatform | undefined {
  const normalized = name.trim().toLowerCase();
  return OTT_PLATFORMS.find((platform) => platform.name.toLowerCase() === normalized);
}

/** Matches a live TMDB provider entry to a configured platform (or passes through). */
export function platformForTmdbProvider(providerId: number, providerName: string): OttPlatform {
  return (
    OTT_PLATFORMS.find((platform) => platform.tmdbProviderId === providerId) ?? { name: providerName }
  );
}

/** True when the platform is on the configured India list. */
export function isKnownIndianPlatform(name: string): boolean {
  return findPlatform(name) !== undefined;
}
