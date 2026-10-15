import { AppError } from './AppError';
import type { MediaProvider } from '@/domain/models/media';

export type CatalogErrorCode = 'configuration' | 'unauthorized' | 'forbidden' | 'not_found' | 'rate_limited' | 'server' | 'timeout' | 'network' | 'invalid_response' | 'graphql' | 'metadata_unavailable';

const messages: Record<CatalogErrorCode, string> = {
  configuration: 'TMDb is not configured. Add the API key to your local Expo environment.',
  unauthorized: 'The catalog could not authorize this request. Check the TMDb API key.',
  forbidden: 'The catalog provider denied this request.',
  not_found: 'This title or season could not be found.',
  rate_limited: 'The catalog is busy. Please try again shortly.',
  server: 'The catalog is temporarily unavailable.',
  timeout: 'The request took too long. Check your connection and try again.',
  network: 'You’re offline. Your saved library still works — reconnect to browse the catalog.',
  invalid_response: 'The catalog returned data that could not be read.',
  graphql: 'AniList could not complete this request. Please try again.',
  metadata_unavailable: 'Episode details are not available from this catalog provider.',
};

export class CatalogError extends AppError {
  readonly userMessage: string;

  constructor(readonly provider: MediaProvider, readonly code: CatalogErrorCode, readonly status?: number) {
    super(code === 'configuration' ? 'configuration' : code === 'network' || code === 'timeout' || code === 'server' || code === 'rate_limited' ? 'network' : 'catalog', messages[code]);
    this.name = 'CatalogError';
    this.userMessage = messages[code];
  }
}
