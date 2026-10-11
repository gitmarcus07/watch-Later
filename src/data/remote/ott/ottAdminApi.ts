import { AppError } from '@/domain/errors/AppError';
import type { NewOttReleaseRecord, OttReleaseRecord } from '@/domain/models/ottRelease';
import { ottRecordId, validateOttRecord } from '@/features/ott/ottLabels';

function supabaseUrl(): string {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!url) throw new AppError('configuration', 'The release database is not configured on this device.');
  return url;
}

function toRow(record: NewOttReleaseRecord): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: record.id ?? ottRecordId({ identity: record, platform: record.platform, country: record.country, isPremiere: record.isPremiere }),
    provider: record.provider,
    media_type: record.mediaType,
    provider_id: record.providerId,
    movie_title: record.movieTitle,
    platform: record.platform,
    platform_logo_url: record.platformLogoUrl ?? null,
    tmdb_provider_id: record.tmdbProviderId ?? null,
    country: record.country,
    theatrical_date: record.theatricalReleaseDate ?? null,
    ott_date: record.ottReleaseDate ?? null,
    date_precision: record.datePrecision,
    status: record.status,
    source_url: record.sourceUrl ?? null,
    source_published_at: record.sourcePublishedAt ?? null,
    last_verified_at: now,
    notes: record.notes ?? null,
    is_premiere: record.isPremiere,
  };
}

/**
 * Authorized admin writes. The service-role key is passed per call from the
 * in-memory session — it is never stored in the app, and normal client keys
 * can never use this path (RLS rejects them regardless).
 */
export async function adminUpsertOttRecord(record: NewOttReleaseRecord, serviceKey: string): Promise<void> {
  if (!serviceKey.trim()) {
    throw new AppError('authentication', 'Enter the service-role key for this session to save.');
  }
  const errors = validateOttRecord(record);
  if (errors.length) {
    throw new AppError('validation', errors[0].message);
  }
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl()}/rest/v1/ott_releases`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(toRow(record)),
    });
  } catch (error) {
    throw new AppError('network', 'The record could not be saved. Check your connection and try again.', { cause: error });
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError('authentication', 'The admin key was rejected. Check the service-role key and try again.');
    }
    throw new AppError('network', `The record could not be saved (HTTP ${response.status}).`);
  }
}

export async function adminDeleteOttRecord(id: string, serviceKey: string): Promise<void> {
  if (!serviceKey.trim()) {
    throw new AppError('authentication', 'Enter the service-role key for this session to delete.');
  }
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl()}/rest/v1/ott_releases?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
  } catch (error) {
    throw new AppError('network', 'The record could not be deleted. Check your connection and try again.', { cause: error });
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError('authentication', 'The admin key was rejected. Check the service-role key and try again.');
    }
    throw new AppError('network', `The record could not be deleted (HTTP ${response.status}).`);
  }
}

export type { NewOttReleaseRecord, OttReleaseRecord };
