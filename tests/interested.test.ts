import { mapTmdbMovie } from '@/data/remote/tmdb/mappers';
import { mapAniListAnime } from '@/data/remote/anilist/mappers';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteWatchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { isUpcomingMedia } from '@/data/remote/catalog/RemoteCatalogRepository';
import { filterUpcomingByWindow, formatInterestedCount, isUpcoming } from '@/features/catalog/upcoming';
import { createSqliteTestAdapter } from './sqliteTestAdapter';

function upcomingMovie(id: number, releaseDate: string) {
  return mapTmdbMovie({
    id, title: `Future Film ${id}`, overview: 'Soon', poster_path: '/p.jpg',
    release_date: releaseDate, genres: [], vote_average: 7, vote_count: 5,
  });
}

describe('interested marks for upcoming titles', () => {
  let adapter: ReturnType<typeof createSqliteTestAdapter>;
  let repository: SqliteWatchStateRepository;

  beforeEach(async () => {
    adapter = createSqliteTestAdapter();
    await runMigrations(adapter.database);
    repository = new SqliteWatchStateRepository(async () => adapter.database);
  });

  afterEach(() => adapter.close());

  it('stores, reads, and removes local interested marks with sync queue work', async () => {
    const media = upcomingMovie(901, '2026-12-01');
    expect(await repository.isInterested(media)).toBe(false);
    await repository.setInterested(media, true);
    expect(await repository.isInterested(media)).toBe(true);
    expect(await repository.getInterested()).toHaveLength(1);
    const pending = await repository.getPendingChanges();
    expect(pending.some((change) => change.entityType === 'interested' && change.providerId === '901' && !change.deleted)).toBe(true);
    await repository.setInterested(media, false);
    expect(await repository.isInterested(media)).toBe(false);
  });

  it('applies remote interested marks without sync loops', async () => {
    const media = upcomingMovie(902, '2026-11-01');
    await repository.applyRemoteChanges([{
      id: -1, entityType: 'interested', entityKey: media.id, provider: media.provider,
      mediaType: media.mediaType, providerId: media.providerId, deleted: false,
      updatedAt: new Date().toISOString(), media, watchedAt: new Date().toISOString(), retryCount: 0,
    }]);
    expect(await repository.isInterested(media)).toBe(true);
  });

  it('detects upcoming titles by future date or status, never by popularity alone', () => {
    expect(isUpcoming(upcomingMovie(903, '2026-12-25'))).toBe(true);
    expect(isUpcomingMedia(upcomingMovie(904, '2026-12-25'))).toBe(true);
    const released = mapTmdbMovie({
      id: 905, title: 'Old Film', overview: '', poster_path: '/p.jpg',
      release_date: '2020-01-01', genres: [], vote_average: 9, vote_count: 500,
    });
    expect(isUpcoming(released)).toBe(false);
  });

  it('detects unreleased anime by AniList status so watched stays gated', () => {
    const futureAnime = mapAniListAnime({
      id: 920, title: { english: 'Future Anime' }, status: 'NOT_YET_RELEASED',
      startDate: { year: 2027, month: 4, day: 1 }, episodes: 12,
    });
    expect(futureAnime.releaseDate).toBe('2027-04-01');
    expect(isUpcoming(futureAnime)).toBe(true);
    expect(isUpcomingMedia(futureAnime)).toBe(true);
    const airedAnime = mapAniListAnime({
      id: 921, title: { english: 'Aired Anime' }, status: 'FINISHED',
      startDate: { year: 2020, month: 1, day: 1 }, episodes: 12,
    });
    expect(isUpcoming(airedAnime)).toBe(false);
  });

  it('filters upcoming windows and formats real interested counts honestly', () => {
    const items = [
      upcomingMovie(911, '2026-10-15'),
      upcomingMovie(912, '2026-12-20'),
      upcomingMovie(913, '2027-06-01'),
    ];
    const today = new Date('2026-10-09T00:00:00');
    expect(filterUpcomingByWindow(items, 'month', today).map((item) => item.providerId)).toEqual(['911']);
    expect(filterUpcomingByWindow(items, 'soon', today).map((item) => item.providerId)).toEqual(['911', '912']);
    expect(filterUpcomingByWindow(items, 'all', today)).toHaveLength(3);
    expect(formatInterestedCount(0)).toBe('Be the first interested');
    expect(formatInterestedCount(42)).toBe('42 Interested');
    expect(formatInterestedCount(37100)).toBe('37.1K Interested');
  });
});
