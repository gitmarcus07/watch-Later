import { CatalogError, type CatalogErrorCode } from '@/domain/errors/CatalogError';
import type { MediaProvider } from '@/domain/models/media';

function codeFromStatus(status: number): CatalogErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'invalid_response';
}

export async function requestJson<T>(provider: MediaProvider, url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new CatalogError(provider, codeFromStatus(response.status), response.status);
    try {
      return await response.json() as T;
    } catch {
      throw new CatalogError(provider, 'invalid_response', response.status);
    }
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    if (signal?.aborted) throw error;
    if (timedOut) throw new CatalogError(provider, 'timeout');
    throw new CatalogError(provider, 'network');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export function withQuery(baseUrl: string, values: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(values)) if (value !== undefined) url.searchParams.set(key, String(value));
  return url.toString();
}
