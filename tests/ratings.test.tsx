import { act, create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CloudWatchStateRepository, PendingWatchStateChange, WatchStateSyncRepository } from '@/domain/models/watchState';
import { mapTmdbMovie } from '@/data/remote/tmdb/mappers';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteWatchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { SyncService } from '@/features/sync/SyncService';
import { createSqliteTestAdapter } from './sqliteTestAdapter';
import { formatRating, roundRating, useRatingSettings } from '@/store/app/ratingSettings';
import { RatingSheet } from '@/components/ratings/RatingSheet';
import { StatusPicker } from '@/components/media/StatusPicker';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

jest.mock('react-native-reanimated', () => {
  const entering = { duration: () => entering, delay: () => entering, withInitialValues: () => entering };
  return { __esModule: true, default: { View: 'View' }, View: 'View', useReducedMotion: () => false, FadeIn: entering, FadeInDown: entering, FadeInUp: entering };
});

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'View' }));

function movie(id: number) {
  return mapTmdbMovie({ id, title: `Film ${id}`, overview: 'Story', poster_path: '/p.jpg', genres: [] });
}

function setupRepository() {
  const adapter = createSqliteTestAdapter();
  const ready = (async () => {
    adapter.raw.exec('PRAGMA foreign_keys = ON');
    await runMigrations(adapter.database);
    return new SqliteWatchStateRepository(async () => adapter.database);
  })();
  return { adapter, ready };
}

describe('user ratings repository', () => {
  it('saves ratings without marking anything watched', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const title = movie(101);
    await repository.setUserRating(title, 8.5, 1);
    expect(await repository.getUserRating(title)).toMatchObject({ rating: 8.5, thumbs: 1 });
    expect(await repository.isMovieWatched(title)).toBe(false);
    expect(await repository.isInWatchlist(title)).toBe(false);
    expect(await repository.getWatchedLibrary()).toHaveLength(0);
    const pending = await repository.getPendingChanges();
    expect(pending.filter((change) => change.entityType === 'rating')).toHaveLength(1);
    const reloaded = new SqliteWatchStateRepository(async () => adapter.database);
    expect(await reloaded.getUserRating(title)).toMatchObject({ rating: 8.5, thumbs: 1 });
    adapter.close();
  });

  it('supports thumbs-only ratings and clearing', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const title = movie(102);
    await repository.setUserRating(title, null, -1);
    expect(await repository.getUserRating(title)).toMatchObject({ rating: null, thumbs: -1 });
    await expect(repository.setUserRating(title, 11, 0)).rejects.toThrow('0 to 10');
    await repository.clearUserRating(title);
    expect(await repository.getUserRating(title)).toBeUndefined();
    adapter.close();
  });

  it('reset clears every rating while keeping watch state', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    await repository.setUserRating(movie(103), 9, 1);
    await repository.markMovieWatched(movie(103), true);
    await repository.clearAllRatings();
    expect(await repository.getUserRatings()).toHaveLength(0);
    expect(await repository.isMovieWatched(movie(103))).toBe(true);
    const pending = await repository.getPendingChanges();
    expect(pending.some((change) => change.entityType === 'rating' && change.deleted)).toBe(true);
    adapter.close();
  });

  it('merges rating tombstones and newer remote ratings on sign-in', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const local: WatchStateSyncRepository = repository;
    const remoteRating: PendingWatchStateChange = {
      id: -1, entityType: 'rating', entityKey: movie(104).id, provider: 'tmdb', mediaType: 'movie',
      providerId: '104', deleted: false, updatedAt: '2026-10-07T10:00:00.000Z', media: movie(104), rating: 7.5, thumbs: 0, retryCount: 0,
    };
    const cloud: jest.Mocked<CloudWatchStateRepository> = {
      getAuthenticatedUserId: jest.fn().mockResolvedValue('account-1'),
      fetch: jest.fn().mockResolvedValue([remoteRating]),
      upsert: jest.fn().mockResolvedValue(undefined),
      getInterestedCounts: jest.fn().mockResolvedValue([]),
    };
    await new SyncService(local, cloud).sync('account-1');
    expect(await repository.getUserRating(movie(104))).toMatchObject({ rating: 7.5 });
    expect(cloud.upsert).not.toHaveBeenCalled();
    adapter.close();
  });

  it('queues guest ratings for upload at account binding', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    await repository.setUserRating(movie(105), 6, 0);
    await repository.bindAccount('account-9');
    const pending = await repository.getPendingChanges();
    expect(pending.some((change) => change.entityType === 'rating' && change.providerId === '105')).toBe(true);
    adapter.close();
  });
});

describe('rewatch counts', () => {
  it('counts movie rewatches and syncs the count', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const title = movie(106);
    await repository.markMovieWatched(title, true);
    await repository.markMovieWatched(title, true);
    const row = await adapter.database.getFirstAsync<{ rewatch_count: number }>('SELECT rewatch_count FROM movie_watches WHERE media_id = ?', title.id);
    expect(row?.rewatch_count).toBe(1);
    const pending = await repository.getPendingChanges();
    expect(pending.find((change) => change.entityType === 'movie')?.rewatchCount).toBe(1);
    await repository.markMovieWatched(title, false);
    expect(await adapter.database.getFirstAsync('SELECT 1 AS found FROM movie_watches WHERE media_id = ?', title.id)).toBeNull();
    adapter.close();
  });
});

describe('rating settings store', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('keeps rating prompts off by default and formats per precision', async () => {
    expect(useRatingSettings.getState().askAfterWatch).toBe(false);
    expect(roundRating(8.555, '0.1')).toBe(8.6);
    expect(roundRating(8.555, '0.01')).toBe(8.56);
    expect(formatRating(8.5, '0.1')).toBe('8.5');
    expect(formatRating(8.5, '0.01')).toBe('8.50');
    useRatingSettings.getState().setAskAfterWatch(true);
    useRatingSettings.getState().setPrecision('0.01');
    const raw = await AsyncStorage.getItem('watch-later.ratings.v1');
    expect(raw).toContain('askAfterWatch');
    useRatingSettings.getState().setAskAfterWatch(false);
    useRatingSettings.getState().setPrecision('0.1');
  });
});

describe('rating sheet and status picker', () => {
  it('saves stars and thumbs, skips without saving', async () => {
    const title = movie(107);
    const saved: { rating: number | null; thumbs: -1 | 0 | 1 }[] = [];
    let closed = 0;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<RatingSheet media={title} initialRating={null} initialThumbs={0} onSave={(rating, thumbs) => saved.push({ rating, thumbs })} onClose={() => { closed += 1; }} />);
    });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: '8 out of 10' }).props.onPress(); });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Thumbs up' }).props.onPress(); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Save rating' })).toBeTruthy();
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Save rating' }).props.onPress(); });
    expect(saved).toEqual([{ rating: 8, thumbs: 1 }]);
    expect(closed).toBe(0);
    renderer.unmount();
  });

  it('shows plan and finished options for movies only', async () => {
    const calls: string[] = [];
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<StatusPicker mediaType="movie" status="none" onSelect={(status) => calls.push(status)} />);
    });
    // findAllByProps matches composites and hosts; labels identify options precisely.
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Plan to Watch' }).length).toBeGreaterThanOrEqual(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Finished' }).length).toBeGreaterThanOrEqual(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Watching' })).toHaveLength(0);
    renderer.unmount();
    await act(async () => {
      renderer = create(<StatusPicker mediaType="series" status="watching" onSelect={(status) => calls.push(status)} />);
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Watching' }).length).toBeGreaterThanOrEqual(1);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Finished' }).props.onPress(); });
    expect(calls).toEqual(['finished']);
    renderer.unmount();
  });

  it('ignores taps on the already-selected status', async () => {
    const calls: string[] = [];
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<StatusPicker mediaType="movie" status="plan" onSelect={(status) => calls.push(status)} />);
    });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Plan to Watch' }).props.onPress(); });
    expect(calls).toHaveLength(0);
    renderer.unmount();
  });
});
