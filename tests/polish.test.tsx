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
import { SqliteWatchStateRepository, watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import type { CatalogMedia } from '@/domain/models/media';
import { createSqliteTestAdapter } from './sqliteTestAdapter';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { isTabletWidth, contentMaxWidth } from '@/theme/responsive';
import { LoadingView, ErrorView, EmptyState, LibraryListSkeleton, DetailSkeleton } from '@/components/feedback/FeedbackViews';
import { AppErrorBoundary } from '@/components/feedback/AppErrorBoundary';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { FadeInView } from '@/components/common/FadeInView';
import { EpisodeList } from '@/components/media/EpisodeList';
import { SeasonsSection } from '@/components/media/SeasonsSection';
import { hasAired } from '@/features/catalog/upcoming';
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
      expect(await repository.isInWatchlist(title)).toBe(true);
      // Watched and watchlist are mutually exclusive — marking watched moves it.
      await repository.markMovieWatched(title, true);
      expect(await repository.isInWatchlist(title)).toBe(false);
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

  it('8b. locks episodes whose air date is still ahead', async () => {
    const day = 86_400_000;
    const dayOf = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10);
    const aired = { provider: 'tmdb', mediaType: 'series', providerId: 'e1', seriesId: 's1', seasonNumber: 1, episodeNumber: 1, title: 'Pilot', airDate: dayOf(-1) } as const;
    const upcoming = { provider: 'tmdb', mediaType: 'series', providerId: 'e2', seriesId: 's1', seasonNumber: 1, episodeNumber: 2, title: 'Next Week', airDate: dayOf(7) } as const;

    expect(hasAired(dayOf(-1))).toBe(true);
    expect(hasAired(dayOf(7))).toBe(false);
    expect(hasAired(undefined)).toBe(true);

    const toggled: string[] = [];
    const list = await renderAsync(<EpisodeList episodes={[aired, upcoming]} watchedIds={[]} onToggleEpisode={(episode) => toggled.push(episode.providerId)} onUpToHere={() => toggled.push('longpress')} />);
    const rows = list.root.findAll((node) => typeof node.props?.onPress === 'function');
    expect(rows).toHaveLength(2);
    // The aired row stays interactive, including its long-press shortcut.
    expect((rows[0].props as { accessibilityState: { disabled: boolean } }).accessibilityState.disabled).toBe(false);
    expect(typeof (rows[0].props as { onLongPress?: unknown }).onLongPress).toBe('function');
    act(() => { (rows[0].props as { onPress: () => void }).onPress(); });
    // The unreleased row is inert: no tap, no long-press.
    expect((rows[1].props as { accessibilityState: { disabled: boolean } }).accessibilityState.disabled).toBe(true);
    expect((rows[1].props as { onLongPress?: unknown }).onLongPress).toBeUndefined();
    expect(toggled).toEqual(['e1']);
    expect(collectText(list.toJSON()).join(' ')).toMatch(/Out /);
  });

  it('8c. collapsed season card keeps the filled checkbox of a finished season', async () => {
    const watchedIds = Array.from({ length: 10 }, (_, index) => `bo-s1e${index + 1}`);
    const episodes = watchedIds.map((providerId, index) => ({
      provider: 'tmdb', mediaType: 'series', providerId, seriesId: '1399',
      seasonNumber: 1, episodeNumber: index + 1, title: `Episode ${index + 1}`, airDate: '2001-09-09',
    }));
    const series: CatalogMedia = {
      provider: 'tmdb', mediaType: 'series', providerId: '1399', id: 'tmdb:series:1399',
      title: 'Band of Brothers', genres: [], episodeMetadata: 'available',
      seasonSummaries: [{ seasonNumber: 1, name: 'Season 1', episodeCount: 10 }],
    };
    const identity = { provider: 'tmdb', mediaType: 'series', providerId: '1399' } as const;
    // Keep the section hermetic: no real SQLite and no real catalog fetch.
    const spies = [
      jest.spyOn(watchStateRepository, 'getWatchedEpisodeIds').mockResolvedValue(watchedIds),
      jest.spyOn(watchStateRepository, 'isSeriesTracked').mockResolvedValue(false),
      jest.spyOn(watchStateRepository, 'getCachedSeason').mockResolvedValue(undefined),
    ];
    const getSeason = catalogRepository.getSeason as jest.Mock;
    getSeason.mockResolvedValue({ series: identity, seasonNumber: 1, name: 'Season 1', episodes });

    const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };
    const checkedToggle = (renderer: ReactTestRenderer, label: string) =>
      renderer.root.findAll((node) => typeof node.props?.onPress === 'function' && node.props?.accessibilityLabel === label);

    try {
      const section = await renderAsync(<QueryClientProvider client={queryClient}><SeasonsSection media={series} /></QueryClientProvider>);
      // Expanded: every aired episode is watched, so the header reads 10/10 and the box is filled.
      let toggle = checkedToggle(section, 'Mark Season 1 unwatched');
      for (let attempt = 0; attempt < 20 && !toggle.length; attempt += 1) { await flush(); toggle = checkedToggle(section, 'Mark Season 1 unwatched'); }
      expect(toggle).toHaveLength(1);
      expect(toggle[0].props.accessibilityState.checked).toBe(true);
      expect(section.root.findAll((node) => node.props?.name === 'checkmark-circle').length).toBeGreaterThanOrEqual(1);

      // Collapse: no episode rows are loaded anymore — the box must stay filled.
      const header = section.root.findAll((node) => typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel === 'string' && node.props.accessibilityLabel.endsWith(', collapse'))[0];
      expect(header).toBeDefined();
      act(() => { (header.props as { onPress: () => void }).onPress(); });
      await flush();

      toggle = checkedToggle(section, 'Mark Season 1 unwatched');
      expect(toggle).toHaveLength(1);
      expect(toggle[0].props.accessibilityState.checked).toBe(true);
      expect(section.root.findAll((node) => node.props?.name === 'checkmark-circle').length).toBeGreaterThanOrEqual(1);
      expect(collectText(section.toJSON()).join(' ')).toMatch(/Season 1, 10 of 10 watched/);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      getSeason.mockReset();
    }
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

  it('auth-driven sync reset only happens for a new sign-in', () => {
    const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
    // A token refresh (hourly, and on foreground) re-attests the SAME
    // account: resetting there wiped a real 'pending'/'error' status from
    // the profile screen while auto-sync still owed an attempt behind backoff.
    expect(rootLayout).toContain('if (event === "SIGNED_IN") useSyncStore.getState().reset();');
  });

  it('sync reset clears the previous account\'s Last synced timestamp', () => {
    useSyncStore.getState().markSynced();
    expect(useSyncStore.getState().lastSyncedAt).toBeTruthy();
    useSyncStore.getState().reset();
    expect(useSyncStore.getState().lastSyncedAt).toBeUndefined();
    expect(useSyncStore.getState().status).toBe('idle');
  });
});
