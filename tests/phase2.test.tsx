import { act, create } from 'react-test-renderer';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/queryClient';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import BrowseScreen from '../app/browse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mapTmdbMovie, mapTmdbTv } from '@/data/remote/tmdb/mappers';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteWatchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { createSqliteTestAdapter } from './sqliteTestAdapter';
import { matchesLocalQuery, normalizeLocalText, suggestCorrection } from '@/lib/localSearch';
import { sortLibraryEntries, stripLeadingArticles } from '@/lib/librarySort';
import { useTvPreferences } from '@/store/app/tvPreferences';
import { PosterCard } from '@/components/media/PosterCard';

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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));

function movie(id: number, title = `Film ${id}`) {
  return mapTmdbMovie({ id, title, overview: 'Story', poster_path: '/p.jpg', release_date: '2024-01-01', genres: [{ id: 1, name: 'Drama' }] });
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

describe('tolerant local search', () => {
  it('ignores case, diacritics, and punctuation', () => {
    expect(normalizeLocalText('Amélie! (2001)')).toBe('amelie 2001');
    expect(matchesLocalQuery('Amélie', 'amelie')).toBe(true);
    expect(matchesLocalQuery('Spider-Man: No Way Home', 'spider home')).toBe(true);
    expect(matchesLocalQuery('Dune', '')).toBe(true);
    expect(matchesLocalQuery('Dune', 'dune part')).toBe(false);
  });

  it('suggests corrections within two edits and never itself', () => {
    expect(suggestCorrection('dun', ['Dune', 'Dune: Part Two'])).toBe('Dune');
    expect(suggestCorrection('dune', ['Dune'])).toBeUndefined();
    expect(suggestCorrection('xyz', ['Dune'])).toBeUndefined();
    expect(suggestCorrection('ab', ['Dune'])).toBeUndefined();
  });
});

describe('library sorting', () => {
  it('sorts titles ignoring leading articles', () => {
    expect(stripLeadingArticles('The Batman')).toBe('Batman');
    expect(stripLeadingArticles('A Quiet Place')).toBe('Quiet Place');
    expect(stripLeadingArticles('An American Tale')).toBe('American Tale');
    expect(stripLeadingArticles('Heat')).toBe('Heat');
    const entries = [
      { title: 'The Batman', year: 2022, addedAt: 'b' },
      { title: 'Avatar', year: 2009, addedAt: 'a' },
      { title: 'A Quiet Place', year: 2018, addedAt: 'c' },
    ];
    expect(sortLibraryEntries(entries, 'title').map((entry) => entry.title)).toEqual(['Avatar', 'The Batman', 'A Quiet Place']);
    expect(sortLibraryEntries(entries, 'year').map((entry) => entry.title)).toEqual(['The Batman', 'A Quiet Place', 'Avatar']);
    expect(sortLibraryEntries(entries, 'recent').map((entry) => entry.title)).toEqual(['The Batman', 'Avatar', 'A Quiet Place']);
  });

  it('sorts by runtime and user rating with unrated last', () => {
    const entries = [
      { title: 'A', runtimeMinutes: 90, userRating: null, addedAt: 'a' },
      { title: 'B', runtimeMinutes: 150, userRating: 9, addedAt: 'b' },
      { title: 'C', runtimeMinutes: undefined, userRating: 7, addedAt: 'c' },
    ];
    expect(sortLibraryEntries(entries, 'runtime').map((entry) => entry.title)).toEqual(['B', 'A', 'C']);
    expect(sortLibraryEntries(entries, 'rating').map((entry) => entry.title)).toEqual(['B', 'C', 'A']);
  });
});

describe('folders', () => {
  it('creates, assigns, and deletes folders without touching lists', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const folder = await repository.createFolder('Horror');
    const list = await repository.createCustomList('Scary');
    await expect(repository.updateCustomList(list.id, { folderId: 'missing' })).rejects.toThrow('folder');
    await repository.updateCustomList(list.id, { folderId: folder.id, icon: 'skull-outline', color: '#E08A5A' });
    expect((await repository.getCustomLists(folder.id)).map(({ id }) => id)).toEqual([list.id]);
    expect((await repository.getCustomLists(null)).map(({ id }) => id)).toEqual([]);
    const detail = await repository.getCustomList(list.id);
    expect(detail).toMatchObject({ icon: 'skull-outline', color: '#E08A5A', folderId: folder.id });
    await repository.deleteFolder(folder.id);
    expect(await repository.getFolders()).toHaveLength(0);
    expect((await repository.getCustomList(list.id))?.folderId).toBeNull();
    expect((await repository.getCustomLists(null)).map(({ id }) => id)).toEqual([list.id]);
    await expect(repository.createFolder('   ')).rejects.toThrow('name');
    adapter.close();
  });
});

describe('manual ordering', () => {
  it('reorders watchlist entries and persists the order', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const first = movie(201);
    const second = movie(202);
    await repository.addToWatchlist(first);
    await repository.addToWatchlist(second);
    expect((await repository.getWatchlist()).map(({ media }) => media.id)).toEqual([second.id, first.id]);
    expect(await repository.moveWatchlistItem(second, 1)).toBe(true);
    expect((await repository.getWatchlist()).map(({ media }) => media.id)).toEqual([first.id, second.id]);
    expect(await repository.moveWatchlistItem(first, -1)).toBe(false);
    const pending = await repository.getPendingChanges();
    expect(pending.filter((change) => change.entityType === 'watchlist')).toHaveLength(2);
    const reloaded = new SqliteWatchStateRepository(async () => adapter.database);
    expect((await reloaded.getWatchlist()).map(({ media }) => media.id)).toEqual([first.id, second.id]);
    adapter.close();
  });

  it('reorders custom list items', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const list = await repository.createCustomList('Order');
    const first = movie(211);
    const second = movie(212);
    await repository.addToCustomList(list.id, first);
    await repository.addToCustomList(list.id, second);
    expect((await repository.getCustomList(list.id))?.items.map(({ media }) => media.id)).toEqual([second.id, first.id]);
    expect(await repository.moveCustomListItem(list.id, second, 1)).toBe(true);
    expect((await repository.getCustomList(list.id))?.items.map(({ media }) => media.id)).toEqual([first.id, second.id]);
    expect(await repository.moveCustomListItem(list.id, second, 1)).toBe(false);
    adapter.close();
  });
});

describe('trash and restore', () => {
  it('snapshots removals, restores them, and purges after thirty days', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const listed = movie(221);
    const watchedTitle = movie(223);
    await repository.addToWatchlist(listed);
    await repository.removeFromWatchlist(listed);
    let trash = await repository.getTrash();
    expect(trash.map((item) => item.kind)).toEqual(['watchlist']);
    await repository.restoreTrashItem(trash[0].id);
    expect(await repository.isInWatchlist(listed)).toBe(true);
    expect(await repository.getTrash()).toHaveLength(0);
    await repository.markMovieWatched(watchedTitle, true);
    await repository.markMovieWatched(watchedTitle, false);
    trash = await repository.getTrash();
    expect(trash.map((item) => item.kind)).toEqual(['movie']);
    await repository.restoreTrashItem(trash[0].id);
    expect(await repository.isMovieWatched(watchedTitle)).toBe(true);
    await repository.setFavorite(watchedTitle, true);
    await repository.setFavorite(watchedTitle, false);
    expect((await repository.getTrash()).map((item) => item.kind)).toEqual(['favorite']);
    await adapter.database.runAsync("UPDATE deleted_items SET deleted_at = datetime('now', '-31 days')");
    expect(await repository.getTrash()).toHaveLength(0);
    adapter.close();
  });

  it('restoring a watchlist item on a watched title moves it back to the watchlist', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const title = movie(224);
    await repository.addToWatchlist(title);
    await repository.removeFromWatchlist(title);
    await repository.markMovieWatched(title, true);
    const trash = await repository.getTrash();
    await repository.restoreTrashItem(trash[0].id);
    expect(await repository.isInWatchlist(title)).toBe(true);
    expect(await repository.isMovieWatched(title)).toBe(false);
    adapter.close();
  });

  it('restores deleted lists with their entries', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const list = await repository.createCustomList('Keep');
    await repository.addToCustomList(list.id, movie(222));
    await repository.deleteCustomList(list.id);
    expect(await repository.getCustomList(list.id)).toBeUndefined();
    const trash = await repository.getTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0].kind).toBe('list');
    await repository.restoreTrashItem(trash[0].id);
    const restored = await repository.getCustomList(list.id);
    expect(restored?.items.map(({ media }) => media.id)).toEqual([movie(222).id]);
    adapter.close();
  });

  it('rejects restoring missing trash rows', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    await expect(repository.restoreTrashItem(9999)).rejects.toThrow('Recently removed');
    await repository.clearTrash();
    adapter.close();
  });
});

describe('custom entries', () => {
  it('creates syncable local titles without catalog data', async () => {
    const { adapter, ready } = setupRepository();
    const repository = await ready;
    const entry = await repository.createCustomEntry({ title: 'Home Movie Night', year: 2023, mediaType: 'movie', notes: 'Our short film' });
    expect(entry.provider).toBe('tmdb');
    expect(entry.providerId.startsWith('custom-')).toBe(true);
    expect(entry.overview).toBe('Our short film');
    expect(await repository.isInWatchlist(entry)).toBe(true);
    const pending = await repository.getPendingChanges();
    expect(pending.some((change) => change.entityType === 'watchlist' && change.providerId === entry.providerId)).toBe(true);
    await expect(repository.createCustomEntry({ title: '   ', mediaType: 'movie' })).rejects.toThrow('title');
    adapter.close();
  });
});

describe('tv preferences store', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('persists the all-seasons view preferences', async () => {
    expect(useTvPreferences.getState().showAllSeasons).toBe(false);
    useTvPreferences.getState().setShowAllSeasons(true);
    useTvPreferences.getState().setExpandSeasonsByDefault(true);
    const raw = await AsyncStorage.getItem('watch-later.tv.v1');
    expect(raw).toContain('showAllSeasons');
    useTvPreferences.getState().setShowAllSeasons(false);
    useTvPreferences.getState().setExpandSeasonsByDefault(false);
  });
});

describe('browse screen', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('shows one request per feed and filters by tab without refetching', async () => {
    const trendingPage = {
      items: [
        mapTmdbMovie({ id: 301, title: 'Hot Film', release_date: '2026-01-01', genres: [] }),
        mapTmdbTv({ id: 302, name: 'Hot Show', first_air_date: '2026-01-01', genres: [] }),
      ],
      page: 1,
      totalPages: 1,
    };
    const trendingSpy = jest.spyOn(catalogRepository, 'getTrendingAllPage').mockResolvedValue(trendingPage);
    const moviesSpy = jest.spyOn(catalogRepository, 'getPopularMoviesPage').mockResolvedValue({ items: [trendingPage.items[0]], page: 1, totalPages: 1 });
    const visibleText = (renderer: ReturnType<typeof create>): string => renderer.root
      .findAllByType('Text' as never)
      .flatMap((node) => (node as { children?: unknown }).children ?? [])
      .filter((child): child is string => typeof child === 'string')
      .join(' ');
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<QueryClientProvider client={queryClient}><BrowseScreen /></QueryClientProvider>);
    });
    await act(async () => {});
    expect(visibleText(renderer)).toContain('Hot Film');
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Show popular movies' }).props.onPress(); });
    // Infinite queries settle over several microtask hops; poll briefly.
    let moviesText = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 25); }); });
      moviesText = visibleText(renderer);
      if (moviesText.includes('Hot Film')) break;
    }
    expect(moviesText).toContain('Hot Film');
    expect(visibleText(renderer)).not.toContain('Hot Show');
    expect(trendingSpy).toHaveBeenCalledTimes(1);
    expect(moviesSpy).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });
});

describe('rating badge', () => {
  it('shows a small user rating on posters without covering the title', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PosterCard title="Film 7" posterUri="https://image.example/p.jpg" subtitle="2024 · Movie" userRating={8.5} />);
    });
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('8.5');
    expect(text).toContain('Film 7');
    renderer.unmount();
  });
});
