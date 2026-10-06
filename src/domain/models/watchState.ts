import type { CatalogMedia, CatalogSeason, MediaEpisode, MediaIdentity } from './media';

export interface WatchlistEntry {
  media: CatalogMedia;
  watchedAt?: string;
  addedAt: string;
}

export interface LibraryStatus {
  watchlisted: boolean;
  movieWatched: boolean;
  tracking: boolean;
}

export interface MovieWatchState {
  media: CatalogMedia;
  watchedAt: string;
}

export interface SeriesProgress {
  identity: MediaIdentity;
  media: CatalogMedia;
  watchedEpisodeCount: number;
  cachedEpisodeCount: number;
  totalEpisodeCount?: number;
  progress: number;
  isComplete: boolean;
  lastWatchedAt?: string;
  nextEpisode?: MediaEpisode;
  nextSeasonNumber?: number;
}

export type ContinueWatchingItem = SeriesProgress;

export type WatchedLibraryItem =
  | { kind: 'movie'; watchedAt: string; media: CatalogMedia }
  | { kind: 'series'; progress: SeriesProgress };

export interface WatchStateRepository {
  getTrackedMedia(identity: MediaIdentity): Promise<CatalogMedia | undefined>;
  getLibraryStatuses(identities: MediaIdentity[]): Promise<Record<string, LibraryStatus>>;
  getCachedSeason(identity: MediaIdentity, seasonNumber: number): Promise<CatalogSeason | undefined>;
  addToWatchlist(media: CatalogMedia): Promise<void>;
  removeFromWatchlist(identity: MediaIdentity): Promise<void>;
  getWatchlist(): Promise<WatchlistEntry[]>;
  isInWatchlist(identity: MediaIdentity): Promise<boolean>;
  markMovieWatched(media: CatalogMedia, watched: boolean): Promise<void>;
  isMovieWatched(identity: MediaIdentity): Promise<boolean>;
  startTrackingSeries(media: CatalogMedia): Promise<void>;
  stopTrackingSeries(identity: MediaIdentity): Promise<void>;
  isSeriesTracked(identity: MediaIdentity): Promise<boolean>;
  storeSeason(media: CatalogMedia, seasonNumber: number, name: string, episodeCount: number | undefined, overview: string | undefined, airDate: string | undefined, posterUrl: string | undefined, episodes: MediaEpisode[]): Promise<void>;
  setEpisodeWatched(media: CatalogMedia, season: CatalogSeason, episode: MediaEpisode, watched: boolean): Promise<void>;
  setSeasonWatched(media: CatalogMedia, season: import('./media').CatalogSeason, watched: boolean): Promise<void>;
  setSeriesWatched(media: CatalogMedia, seasons: { seasonNumber: number; name: string; episodeCount?: number; overview?: string; airDate?: string; posterUrl?: string; episodes: MediaEpisode[] }[], watched: boolean): Promise<void>;
  getEpisodeWatched(identity: MediaIdentity): Promise<boolean>;
  getWatchedEpisodeIds(seriesIdentity: MediaIdentity, seasonNumber: number): Promise<string[]>;
  getSeriesProgress(): Promise<SeriesProgress[]>;
  getContinueWatching(): Promise<ContinueWatchingItem[]>;
  getWatchedLibrary(): Promise<WatchedLibraryItem[]>;
}

export type SyncEntityType = 'watchlist' | 'movie' | 'series' | 'episode';

export interface PendingWatchStateChange {
  id: number;
  entityType: SyncEntityType;
  entityKey: string;
  provider: MediaIdentity['provider'];
  mediaType: MediaIdentity['mediaType'];
  providerId: string;
  seasonNumber?: number;
  episodeNumber?: number;
  deleted: boolean;
  updatedAt: string;
  media: CatalogMedia;
  watchedAt?: string;
  episode?: MediaEpisode;
  retryCount: number;
}

export interface CloudWatchStateRepository {
  getAuthenticatedUserId(): Promise<string | undefined>;
  fetch(userId: string): Promise<PendingWatchStateChange[]>;
  upsert(userId: string, changes: PendingWatchStateChange[]): Promise<void>;
}

export interface WatchStateSyncRepository {
  getPendingChanges(): Promise<PendingWatchStateChange[]>;
  applyRemoteChanges(changes: PendingWatchStateChange[]): Promise<void>;
  markSynced(changes: PendingWatchStateChange[]): Promise<void>;
  recordSyncFailure(changes: PendingWatchStateChange[], safeMessage: string): Promise<void>;
  bindAccount(accountId: string): Promise<void>;
  getBoundAccount(): Promise<string | undefined>;
}
