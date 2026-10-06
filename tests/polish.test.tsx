import { readFileSync } from 'node:fs';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { queryClient } from '@/lib/query/queryClient';
import { AppError, toAppError } from '@/domain/errors/AppError';
import { CatalogError } from '@/domain/errors/CatalogError';
import { mapTmdbMovie } from '@/data/remote/tmdb/mappers';
import { catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { runMigrations } from '@/data/local/database/migrations';
import { SqliteWatchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { createSqliteTestAdapter } from './sqliteTestAdapter';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { isTabletWidth, contentMaxWidth } from '@/theme/responsive';
import { LoadingView, ErrorView, EmptyState, LibraryListSkeleton, DetailSkeleton } from '@/components/feedback/FeedbackViews';
import { AppErrorBoundary } from '@/components/feedback/AppErrorBoundary';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { FadeInView } from '@/components/common/FadeInView';
import { EpisodeList } from '@/components/media/EpisodeList';
import { TrackedMediaRow } from '@/components/media/TrackedMediaRow';
import { PosterCard } from '@/components/media/PosterCard';
import { useCatalogSearch } from '@/features/catalog/hooks';
import { useSyncStore } from '@/store/app/syncStore';
import { __resetAutoSyncForTests, startAutoSync, stopAutoSync } from '@/features/sync/autoSync';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

jest.mock('react-native-reanimated', () => {
  const entering = { duration: () => entering, delay: () => entering, withInitialValues: () => entering };
  return { __esModule: true, default: { View: 'View' }, View: 'View', useReducedMotion: () => false, FadeIn: entering, FadeInDown: entering, FadeInUp: entering };
});

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'View' }));

jest.mock('@/data/remote/catalog/RemoteCatalogRepository', () => ({
  catalogRepository: { search: jest.fn(), getMedia: jest.fn(), getSeason: jest.fn() },
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const netInfoAddListener = NetInfo.addEventListener as jest.Mock;
const catalogSearch = catalogRepository.search as jest.Mock;

function media() {
  return mapTmdbMovie({ id: 7, title: 'Film 7', overview: 'A local film', poster_path: '/poster.jpg', genres: [] });
}

function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((child) => collectText(child, out)); return out; }
  if (typeof node === 'object') {
    const props = (node as { props?: Record<string, unknown> }).props;
    for (const key of ['accessibilityLabel', 'accessibilityHint']) {
      if (props && typeof props[key] === 'string') out.push(props[key] as string);
    }
    collectText((node as { children?: unknown }).children, out);
  }
  return out;
}

const mounted: ReactTestRenderer[] = [];

async function renderAsync(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(element); });
  mounted.push(renderer);
  return renderer;
}

describe('Phase 6 polish', () => {
  beforeEach(() => {
    useSyncStore.getState().setSyncState('idle');
    queryClient.clear();
    catalogSearch.mockReset();
  });

  afterEach(async () => {
    await act(async () => { mounted.splice(0).forEach((renderer) => renderer.unmount()); });
    queryClient.clear();
  });

  it('1. loading states render with announcements instead of blank screens', async () => {
    const loading = await renderAsync(<LoadingView label="Loading your watchlist" />);
    expect(collectText(loading.toJSON())).toContain('Loading your watchlist');
    const skeleton = await renderAsync(<LibraryListSkeleton rows={3} />);
    expect(skeleton.root.findAllByProps({ accessibilityLabel: 'Loading your library' }).length).toBeGreaterThanOrEqual(1);
    const detail = await renderAsync(<DetailSkeleton />);
    expect(detail.root.findAllByProps({ accessibilityLabel: 'Loading title details' }).length).toBeGreaterThanOrEqual(1);
  });

  it('2. empty states explain what is empty and offer a next step', async () => {
    const pressed: string[] = [];
    const empty = await renderAsync(
      <EmptyState title="Your watchlist is empty" message="You haven't saved anything yet." actionLabel="Find something to watch" onAction={() => pressed.push('search')} />,
    );
    const text = collectText(empty.toJSON());
    expect(text).toContain('Your watchlist is empty');
    expect(text).toContain("You haven't saved anything yet.");
    const action = empty.root.findByProps({ accessibilityLabel: 'Find something to watch' });
    act(() => { (action.props as { onPress: () => void }).onPress(); });
    expect(pressed).toEqual(['search']);
  });

  it('3. errors become safe user-facing messages without technical leaks', () => {
    expect(friendlyErrorMessage(new AppError('network', 'socket hangup ECONNREFUSED 10.0.0.1'))).toMatch(/offline/i);
    expect(friendlyErrorMessage(new CatalogError('tmdb', 'rate_limited'))).toMatch(/busy|try again/i);
    expect(friendlyErrorMessage(new AppError('authentication', 'jwt expired'))).toMatch(/sign in/i);
    expect(friendlyErrorMessage(new Error('SELECT * FROM sqlite_master PANIC'))).not.toMatch(/sqlite_master|PANIC/);
    expect(friendlyErrorMessage(new AppError('database', 'disk i/o error'))).not.toMatch(/disk i\/o/);
    expect(friendlyErrorMessage(new CatalogError('tmdb', 'rate_limited'))).toBe(new CatalogError('tmdb', 'rate_limited').userMessage);
    expect(toAppError(new Error('weird')).message).toBe('Something went wrong. Please try again.');
  });

  it('4. error boundary catches rendering errors and offers recovery without data loss', async () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error('simulated render crash');
      return <Text>recovered</Text>;
    };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<AppErrorBoundary><Flaky /></AppErrorBoundary>); mounted.push(renderer); });
    expect(collectText(renderer.toJSON()).join(' ')).toMatch(/Something went wrong/);
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Try again' });
    await act(async () => { shouldThrow = false; (retry.props as { onPress: () => void }).onPress(); });
    expect(collectText(renderer.toJSON())).toContain('recovered');
  });

  it('5. local watch-state mutations work with no network involved', async () => {
    const adapter = createSqliteTestAdapter();
    try {
      await runMigrations(adapter.database);
      const repository = new SqliteWatchStateRepository(async () => adapter.database);
      const title = media();
      await repository.addToWatchlist(title);
      await repository.markMovieWatched(title, true);
      expect(await repository.isInWatchlist(title)).toBe(true);
      expect(await repository.isMovieWatched(title)).toBe(true);
      const pending = await repository.getPendingChanges();
      expect(pending.length).toBeGreaterThanOrEqual(2);
    } finally {
      adapter.close();
    }
  });

  it('6. recent catalog results serve from cache without refetching', async () => {
    const title = media();
    catalogSearch.mockResolvedValue({ items: [title], unavailableProviders: [] });
    queryClient.setQueryData(['catalog', 'search', 'dune', 'all'], { items: [title], unavailableProviders: [] });
    const Probe = () => {
      const result = useCatalogSearch('dune', 'all', true);
      if (result.isLoading) return <Text>loading</Text>;
      return <Text>{result.data?.items.map((item) => item.title).join(',')}</Text>;
    };
    const renderer = await renderAsync(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    expect(collectText(renderer.toJSON())).toContain('Film 7');
    expect(catalogSearch).not.toHaveBeenCalled();
  });

  it('7. error views retry through the provided callback', async () => {
    const calls: string[] = [];
    const view = await renderAsync(<ErrorView message="Nope." onRetry={() => calls.push('retry')} />);
    const retry = view.root.findByProps({ accessibilityLabel: 'Try again' });
    act(() => { (retry.props as { onPress: () => void }).onPress(); });
    expect(calls).toEqual(['retry']);
  });

  it('8. icon controls expose meaningful accessibility labels', async () => {
    const episode = { provider: 'tmdb', mediaType: 'series', providerId: 'e1', seriesId: 's1', seasonNumber: 1, episodeNumber: 1, title: 'Pilot' } as const;
    const list = await renderAsync(<EpisodeList episodes={[episode]} watchedIds={[]} onToggleEpisode={() => undefined} />);
    const labels = collectText(list.toJSON()).join(' | ');
    expect(labels).toMatch(/Pilot/);
    expect(labels).toMatch(/watched/);

    const title = media();
    const row = await renderAsync(<TrackedMediaRow media={title} onPress={() => undefined} actionLabel="Remove Film 7 from watchlist" actionIcon="bookmark" onAction={() => undefined} />);
    expect(collectText(row.toJSON()).join(' ')).toMatch(/Remove Film 7 from watchlist/);

    const card = await renderAsync(<PosterCard title="Film 7" posterUri="https://image.example/p.jpg" />);
    expect(collectText(card.toJSON()).join(' ')).toMatch(/Film 7/);
  });

  it('10. foreground connectivity listener cleans up on unmount', async () => {
    __resetAutoSyncForTests();
    netInfoAddListener.mockClear();
    const unsubscribe = jest.fn();
    netInfoAddListener.mockReturnValueOnce(unsubscribe);
    const stop = startAutoSync();
    expect(netInfoAddListener).toHaveBeenCalledTimes(1);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    stopAutoSync();
    __resetAutoSyncForTests();
  });

  it('11. offline banner appears offline and cleans up its listener', async () => {
    const listeners: ((state: { isConnected?: boolean }) => void)[] = [];
    netInfoAddListener.mockImplementationOnce((listener: (state: { isConnected?: boolean }) => void) => {
      listeners.push(listener);
      return jest.fn();
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<OfflineBanner />); mounted.push(renderer); });
    expect(collectText(renderer.toJSON()).join(' ')).not.toMatch(/Offline/);
    await act(async () => { listeners.forEach((listener) => listener({ isConnected: false })); });
    expect(collectText(renderer.toJSON()).join(' ')).toMatch(/Offline/);
    const unsubscribe = netInfoAddListener.mock.results[netInfoAddListener.mock.results.length - 1].value as jest.Mock;
    await act(async () => { renderer.unmount(); });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('12. navigation relies on Expo Router without duplicate global handlers', () => {
    const tabsLayout = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
    const detail = readFileSync('app/media/[id].tsx', 'utf8');
    for (const source of [tabsLayout, rootLayout, detail]) expect(source).not.toMatch(/BackHandler/);
    expect((detail.match(/router\.back\(\)/g) ?? []).length).toBe(1);
  });

  it('13. responsive rules separate phones from tablets', () => {
    expect(isTabletWidth(399)).toBe(false);
    expect(isTabletWidth(700)).toBe(true);
    expect(isTabletWidth(1024)).toBe(true);
    expect(contentMaxWidth(500)).toBeUndefined();
    expect(contentMaxWidth(900)).toBe(760);
  });

  it('catalog cache lifetimes keep detail and seasons warm', () => {
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(10 * 60_000);
  });

  it('animated entrance renders children', async () => {
    const view = await renderAsync(<FadeInView><Text>fading in</Text></FadeInView>);
    expect(collectText(view.toJSON())).toContain('fading in');
  });
});
