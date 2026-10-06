import { readFileSync } from 'node:fs';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/queryClient';
import { CatalogError } from '@/domain/errors/CatalogError';
import { mapTmdbMovie, mapTmdbTv } from '@/data/remote/tmdb/mappers';
import { mapAniListAnime } from '@/data/remote/anilist/mappers';
import { tmdbClient } from '@/data/remote/tmdb/client';
import { anilistClient } from '@/data/remote/anilist/client';
import { interleaveRanked, RemoteCatalogRepository, catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { useRecentlyReleased, useTrending } from '@/features/catalog/hooks';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const movieDto = (id: number, title: string, releaseDate: string) => ({
  id, title, overview: 'Story', poster_path: '/p.jpg', release_date: releaseDate, genres: [], vote_average: 7, vote_count: 10,
});
const tvDto = (id: number, name: string, airDate: string) => ({
  id, name, overview: 'Story', poster_path: '/p.jpg', first_air_date: airDate, genres: [], vote_average: 7, vote_count: 10,
});
const animeDto = (id: number, title: string) => ({
  id, title: { english: title }, coverImage: { large: 'https://img.example/c.jpg' }, genres: [],
});

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

describe('live discovery endpoints', () => {
  beforeEach(() => { jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unmocked network request blocked by discovery test')); });
  afterEach(() => jest.restoreAllMocks());

  it('requests real TMDb trending and release list endpoints', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ results: [movieDto(1, 'A', '2026-01-01')] }));
    await tmdbClient.trendingMovies();
    expect(fetchSpy.mock.calls[0][0] as string).toContain('trending/movie/week');

    fetchSpy.mockResolvedValueOnce(response({ results: [tvDto(2, 'B', '2026-02-01')] }));
    await tmdbClient.trendingTv();
    expect(fetchSpy.mock.calls[1][0] as string).toContain('trending/tv/week');

    fetchSpy.mockResolvedValueOnce(response({ results: [movieDto(3, 'C', '2026-03-01')] }));
    await tmdbClient.nowPlayingMovies();
    expect(fetchSpy.mock.calls[2][0] as string).toContain('movie/now_playing');

    fetchSpy.mockResolvedValueOnce(response({ results: [tvDto(4, 'D', '2026-04-01')] }));
    await tmdbClient.onTheAirTv();
    expect(fetchSpy.mock.calls[3][0] as string).toContain('tv/on_the_air');
  });

  it('requests AniList trending anime through the existing GraphQL client', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ data: { Page: { media: [animeDto(11, 'Anime A')] } } }));
    const media = await anilistClient.trendingAnime();
    expect(media).toMatchObject([{ id: 11 }]);
    expect(String(fetchSpy.mock.calls[0][1]?.body)).toContain('TRENDING_DESC');
  });
});

describe('discovery repository', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockProviders() {
    jest.spyOn(tmdbClient, 'trendingMovies').mockResolvedValue({ results: [movieDto(1, 'Film A', '2026-01-01'), movieDto(2, 'Film B', '2025-01-01')] });
    jest.spyOn(tmdbClient, 'trendingTv').mockResolvedValue({ results: [tvDto(3, 'Show C', '2026-02-01')] });
    jest.spyOn(anilistClient, 'trendingAnime').mockResolvedValue([animeDto(4, 'Anime D')]);
    jest.spyOn(tmdbClient, 'nowPlayingMovies').mockResolvedValue({ results: [movieDto(5, 'New Film', '2026-09-01'), movieDto(6, 'Old Film', '2020-01-01')] });
    jest.spyOn(tmdbClient, 'onTheAirTv').mockResolvedValue({ results: [tvDto(7, 'New Show', '2026-08-15')] });
  }

  it('interleaves ranked provider lists without fabricating identities', async () => {
    mockProviders();
    const trending = await new RemoteCatalogRepository().getTrending();
    expect(trending.map((item) => item.id)).toEqual(['tmdb:movie:1', 'tmdb:series:3', 'anilist:anime:4', 'tmdb:movie:2']);
    expect(trending).toHaveLength(4);
    for (const item of trending) expect(item.posterUrl ?? item.title).toBeTruthy();
  });

  it('orders recent releases newest first and caps home sections', async () => {
    mockProviders();
    const recent = await new RemoteCatalogRepository().getRecentlyReleased();
    expect(recent.map((item) => item.id)).toEqual(['tmdb:movie:5', 'tmdb:series:7', 'tmdb:movie:6']);
  });

  it('keeps provider-qualified identities distinct and tolerates a single failed provider', async () => {
    mockProviders();
    jest.spyOn(tmdbClient, 'trendingTv').mockResolvedValue({ results: [tvDto(1, 'Film A', '2026-01-01')] });
    const trending = await new RemoteCatalogRepository().getTrending();
    // Same numeric ID and title, but movie vs series stay independent.
    expect(trending.map((item) => item.id).sort()).toEqual(['anilist:anime:4', 'tmdb:movie:1', 'tmdb:movie:2', 'tmdb:series:1'].sort());
    jest.spyOn(anilistClient, 'trendingAnime').mockRejectedValue(new CatalogError('anilist', 'network'));
    const partial = await new RemoteCatalogRepository().getTrending();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.every((item) => item.provider === 'tmdb')).toBe(true);
  });

  it('throws a safe error only when every provider fails', async () => {
    jest.spyOn(tmdbClient, 'trendingMovies').mockRejectedValue(new CatalogError('tmdb', 'network'));
    jest.spyOn(tmdbClient, 'trendingTv').mockRejectedValue(new CatalogError('tmdb', 'network'));
    jest.spyOn(anilistClient, 'trendingAnime').mockRejectedValue(new CatalogError('anilist', 'network'));
    await expect(new RemoteCatalogRepository().getTrending()).rejects.toBeInstanceOf(CatalogError);
  });

  it('interleaveRanked is rank-aware, bounded, and provider-neutral', () => {
    const a = [mapTmdbMovie(movieDto(1, 'A', '2026-01-01')), mapTmdbMovie(movieDto(2, 'B', '2026-01-01'))];
    const b = [mapTmdbTv(tvDto(3, 'C', '2026-01-01'))];
    const c = [mapAniListAnime(animeDto(4, 'D'))];
    expect(interleaveRanked([a, b, c], 3).map((item) => item.id)).toEqual(['tmdb:movie:1', 'tmdb:series:3', 'anilist:anime:4']);
    expect(interleaveRanked([a, a, b], 10)).toHaveLength(3);
  });
});

describe('discovery hooks and home structure', () => {
  beforeEach(() => { queryClient.clear(); });
  afterEach(() => { queryClient.clear(); jest.restoreAllMocks(); });

  it('fetches each discovery feed once and serves cache on remount', async () => {
    // Fake timers neutralize TanStack stale/gc timeouts so teardown never hangs.
    jest.useFakeTimers();
    try {
      const trending = [mapTmdbMovie(movieDto(1, 'Film A', '2026-01-01'))];
      const recent = [mapTmdbTv(tvDto(2, 'Show B', '2026-02-01'))];
      const trendingSpy = jest.spyOn(catalogRepository, 'getTrending').mockResolvedValue(trending);
      const recentSpy = jest.spyOn(catalogRepository, 'getRecentlyReleased').mockResolvedValue(recent);
      const Probe = () => {
        const t = useTrending();
        const r = useRecentlyReleased();
        if (t.isLoading || r.isLoading) return <Text>loading</Text>;
        return <Text>{[...(t.data ?? []), ...(r.data ?? [])].map((item) => item.title).join(',')}</Text>;
      };
      let first!: ReturnType<typeof create>;
      let second!: ReturnType<typeof create>;
      await act(async () => { first = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });
      await act(async () => { await jest.advanceTimersByTimeAsync(10); });
      await act(async () => { await jest.advanceTimersByTimeAsync(10); });
      expect(JSON.stringify(first.toJSON())).toContain('Film A');
      await act(async () => { second = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });
      await act(async () => { await jest.advanceTimersByTimeAsync(10); });
      expect(trendingSpy).toHaveBeenCalledTimes(1);
      expect(recentSpy).toHaveBeenCalledTimes(1);
      await act(async () => { first.unmount(); second.unmount(); });
    } finally {
      jest.useRealTimers();
    }
  });

  it('home focuses on continue watching plus live discovery sections', () => {
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toMatch(/Continue Watching/);
    expect(home).toMatch(/Trending Now/);
    expect(home).toMatch(/Recently Released/);
    expect(home).toMatch(/\/media\/\[id\]/);
    expect(home).not.toMatch(/Recently Added/);
    expect(home).not.toMatch(/Recently Watched/);
  });
});
