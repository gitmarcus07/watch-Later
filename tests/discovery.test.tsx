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
import { tvdbClient } from '@/data/remote/tvdb/client';
import { interleaveRanked, RemoteCatalogRepository, catalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { languageName, countryName } from '@/features/catalog/metaNames';
import { useRecentlyReleased, useTrending } from '@/features/catalog/hooks';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const movieDto = (id: number, title: string, releaseDate: string) => ({
  id, title, overview: 'Story', poster_path: '/p.jpg', release_date: releaseDate, genres: [], vote_average: 7, vote_count: 10,
});
const tvDto = (id: number, name: string, airDate: string) => ({
  id, name, overview: 'Story', poster_path: '/p.jpg', first_air_date: airDate, genres: [], vote_average: 7, vote_count: 10,
});
const animeDto = (id: number, title: string, status?: string, year?: number) => ({
  id, title: { english: title }, coverImage: { large: 'https://img.example/c.jpg' }, genres: [],
  ...(status ? { status } : {}),
  ...(year ? { startDate: { year, month: 12, day: 1 } } : {}),
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

    fetchSpy.mockResolvedValueOnce(response({ results: [movieDto(5, 'E', '2026-12-01')] }));
    await tmdbClient.upcomingMovies();
    expect(fetchSpy.mock.calls[4][0] as string).toContain('movie/upcoming');

    fetchSpy.mockResolvedValueOnce(response({ results: [tvDto(6, 'F', '2026-12-01')] }));
    await tmdbClient.upcomingTvSeries();
    const upcomingTvUrl = fetchSpy.mock.calls[5][0] as string;
    expect(upcomingTvUrl).toContain('discover/tv');
    expect(upcomingTvUrl).toContain('first_air_date.gte');

    fetchSpy.mockResolvedValueOnce(response({ results: [tvDto(7, 'G', '2026-12-01')] }));
    await tmdbClient.airingTodayTv();
    expect(fetchSpy.mock.calls[6][0] as string).toContain('tv/airing_today');
  });

  it('requests AniList trending anime through the existing GraphQL client', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ data: { Page: { media: [animeDto(11, 'Anime A')] } } }));
    const media = await anilistClient.trendingAnime();
    expect(media).toMatchObject([{ id: 11 }]);
    expect(String(fetchSpy.mock.calls[0][1]?.body)).toContain('TRENDING_DESC');
  });

  it('requests upcoming anime with a not-yet-released status filter', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ data: { Page: { media: [animeDto(12, 'Anime B')] } } }));
    const media = await anilistClient.upcomingAnime();
    expect(media).toMatchObject([{ id: 12 }]);
    expect(String(fetchSpy.mock.calls[0][1]?.body)).toContain('NOT_YET_RELEASED');
  });

  it('requests paged trending, popular, discover, and bollywood endpoints', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ results: [movieDto(20, 'T', '2026-01-01')], page: 2, total_pages: 10 }));
    await tmdbClient.trendingAll(2);
    expect(fetchSpy.mock.calls[0][0] as string).toContain('trending/all/week');
    expect(fetchSpy.mock.calls[0][0] as string).toContain('page=2');

    fetchSpy.mockResolvedValueOnce(response({ results: [], page: 1, total_pages: 1 }));
    await tmdbClient.popularMovies(1, 'IN');
    expect(fetchSpy.mock.calls[1][0] as string).toContain('movie/popular');
    expect(fetchSpy.mock.calls[1][0] as string).toContain('region=IN');

    fetchSpy.mockResolvedValueOnce(response({ results: [], page: 1, total_pages: 1 }));
    await tmdbClient.discoverMovies(1, { language: 'hi', region: 'IN' });
    const discoverUrl = fetchSpy.mock.calls[2][0] as string;
    expect(discoverUrl).toContain('discover/movie');
    expect(discoverUrl).toContain('with_original_language=hi');

    fetchSpy.mockResolvedValueOnce(response({ results: [], page: 1, total_pages: 1 }));
    await tmdbClient.discoverTv(3, { language: 'hi' });
    expect(fetchSpy.mock.calls[3][0] as string).toContain('page=3');
  });

  it('requests paged popular anime with page variables', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(response({ data: { Page: { media: [animeDto(13, 'Anime C')], pageInfo: { hasNextPage: true, lastPage: 40 } } } }));
    const result = await anilistClient.popularAnime(2, 24);
    expect(result.media).toMatchObject([{ id: 13 }]);
    expect(result.hasNextPage).toBe(true);
    const body = String(fetchSpy.mock.calls[0][1]?.body);
    expect(body).toContain('POPULARITY_DESC');
    expect(body).toContain('"page":2');
  });
});

describe('discovery repository', () => {
  afterEach(() => jest.restoreAllMocks());

  const tvdbMovie = (id: number, name: string, year: string, score: number, status = 'Released') => ({
    id, name, year, score, status: { name }, image: `/banners/v4/movie/${id}/posters/x.jpg`,
  });
  const tvdbSeries = (id: number, name: string, firstAired: string, year: string, score: number, status = 'Continuing') => ({
    id, name, firstAired, year, score, status: { name }, image: `/banners/posters/${id}-1.jpg`, originalLanguage: 'eng',
  });
  const tvdbLinks = (total: number, size = 500) => ({ total_items: total, page_size: size });

  function mockTvdbTrending() {
    jest.spyOn(tvdbClient, 'filterMovies').mockResolvedValue({ data: [tvdbMovie(1, 'Film A', '2026', 900), tvdbMovie(2, 'Film B', '2025', 100)], links: tvdbLinks(1000) } as never);
    jest.spyOn(tvdbClient, 'filterSeries').mockResolvedValue({ data: [tvdbSeries(3, 'Show C', '2026-02-01', '2026', 800)], links: tvdbLinks(1000) } as never);
  }

  it('interleaves ranked provider lists without fabricating identities', async () => {
    mockTvdbTrending();
    const trending = await new RemoteCatalogRepository().getTrending();
    expect(trending.map((item) => item.id)).toEqual(['tvdb:movie:1', 'tvdb:series:3', 'tvdb:movie:2']);
    expect(trending).toHaveLength(3);
    for (const item of trending) expect(item.posterUrl ?? item.title).toBeTruthy();
  });

  it('orders recent releases newest first and caps home sections', async () => {
    jest.spyOn(tvdbClient, 'filterMovies').mockResolvedValue({ data: [tvdbMovie(5, 'New Film', '2026', 400)], links: tvdbLinks(200) } as never);
    jest.spyOn(tvdbClient, 'filterSeries').mockResolvedValue({
      data: [tvdbSeries(7, 'New Show', '2026-08-15', '2026', 500), tvdbSeries(6, 'Old Show', '2020-01-01', '2020', 300)],
      links: tvdbLinks(200),
    } as never);
    const recent = await new RemoteCatalogRepository().getRecentlyReleased();
    expect(recent.map((item) => item.id)).toEqual(['tvdb:series:7', 'tvdb:movie:5', 'tvdb:series:6']);
  });

  it('returns future-dated upcoming titles ordered oldest first', async () => {
    jest.spyOn(tvdbClient, 'filterMovies').mockResolvedValue({
      data: [tvdbMovie(8, 'Future Film', '2099', 10, 'Announced')], links: tvdbLinks(1),
    } as never);
    jest.spyOn(tvdbClient, 'filterSeries').mockImplementation(async ({ genre }) => ({
      data: genre === 27
        ? [tvdbSeries(10, 'Future Anime', '2099-04-01', '2099', 20, 'Continuing')]
        : [tvdbSeries(9, 'Future Show', '2099-01-05', '2099', 30, 'Continuing')],
      links: tvdbLinks(1),
    } as never));
    const upcoming = await new RemoteCatalogRepository().getUpcoming();
    expect(upcoming.map((item) => item.id)).toEqual(['tvdb:movie:8', 'tvdb:series:9', 'tvdb:anime:10']);
    const dates = upcoming.map((item) => item.releaseDate ?? '');
    expect([...dates].sort()).toEqual(dates);
  });

  it('pages upcoming years in one shot with honest single-page totals', async () => {
    jest.spyOn(tvdbClient, 'filterMovies').mockResolvedValue({ data: [tvdbMovie(40, 'Future Film', '2099', 10, 'Announced')], links: tvdbLinks(1) } as never);
    jest.spyOn(tvdbClient, 'filterSeries').mockResolvedValue({ data: [tvdbSeries(41, 'Future Show', '2099-01-05', '2099', 30, 'Continuing')], links: tvdbLinks(1) } as never);
    const repo = new RemoteCatalogRepository();
    await expect(repo.getUpcomingMoviesPage(1)).resolves.toMatchObject({ page: 1, totalPages: 1, items: [{ id: 'tvdb:movie:40' }] });
    await expect(repo.getUpcomingSeriesPage(1)).resolves.toMatchObject({ page: 1, totalPages: 1, items: [{ id: 'tvdb:series:41' }] });
    await expect(repo.getUpcomingAnimePage(1)).resolves.toMatchObject({ page: 1, totalPages: 1 });
    await expect(repo.getUpcomingMoviesPage(2)).resolves.toMatchObject({ page: 2, items: [] });
  });

  it('pages trending-all and bollywood feeds with capped totals', async () => {
    jest.spyOn(tvdbClient, 'filterMovies').mockResolvedValue({
      data: [tvdbMovie(30, 'Trend Film', '2026', 950), tvdbMovie(31, 'Hindi Film', '2026', 400)], links: tvdbLinks(10500),
    } as never);
    jest.spyOn(tvdbClient, 'filterSeries').mockResolvedValue({
      data: [tvdbSeries(32, 'Hindi Show', '2026-03-01', '2026', 350)], links: tvdbLinks(10500),
    } as never);
    const trending = await new RemoteCatalogRepository().getTrendingAllPage(1);
    expect(trending.page).toBe(1);
    expect(trending.totalPages).toBe(20);
    expect(trending.items.map((item) => item.id)).toEqual(['tvdb:movie:30', 'tvdb:series:32', 'tvdb:movie:31']);

    const bollywood = await new RemoteCatalogRepository().getBollywoodPage(1);
    expect(bollywood.items.map((item) => item.id).sort()).toEqual(['tvdb:movie:30', 'tvdb:movie:31', 'tvdb:series:32'].sort());
    expect(bollywood.totalPages).toBe(20);
  });

  it('resolves directors and age ratings from TMDb with regional fallback', async () => {
    jest.spyOn(tmdbClient, 'credits').mockResolvedValue({ crew: [{ name: 'A Director', job: 'Director' }, { name: 'A Director', job: 'Director' }, { name: 'A Writer', job: 'Writer' }] });
    jest.spyOn(tmdbClient, 'releaseDates').mockResolvedValue({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }] });
    jest.spyOn(tmdbClient, 'contentRatings').mockResolvedValue({ results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] });
    const repo = new RemoteCatalogRepository();
    await expect(repo.getDirectors({ provider: 'tmdb', mediaType: 'movie', providerId: '1' })).resolves.toEqual(['A Director']);
    await expect(repo.getContentRating({ provider: 'tmdb', mediaType: 'movie', providerId: '1' })).resolves.toBe('PG-13');
    await expect(repo.getContentRating({ provider: 'tmdb', mediaType: 'series', providerId: '2' })).resolves.toBe('TV-MA');
    await expect(repo.getDirectors({ provider: 'anilist', mediaType: 'anime', providerId: '3' })).resolves.toEqual([]);
  });

  it('resolves TVDB cast, directors, ratings, and trailers from extended records', async () => {
    jest.spyOn(tvdbClient, 'getMovie').mockResolvedValue({
      id: 290272, name: 'Dune: Part Two', year: '2024',
      characters: [
        { personName: 'Timothee Chalamet', name: 'Paul Atreides', peopleType: 'Actor', image: '/banners/v4/actor/1/photo/x.jpg', sort: 1 },
        { personName: 'Denis Villeneuve', name: 'Denis Villeneuve', peopleType: 'Director', sort: 50 },
      ],
      contentRatings: [{ name: 'PG-13', country: 'usa' }],
      trailers: [{ name: 'Trailer', url: 'https://www.youtube.com/watch?v=Way9Dexny3w', language: 'eng' }],
    } as never);
    const repo = new RemoteCatalogRepository();
    const identity = { provider: 'tvdb', mediaType: 'movie', providerId: '290272' } as const;
    await expect(repo.getDirectors(identity)).resolves.toEqual(['Denis Villeneuve']);
    await expect(repo.getContentRating(identity)).resolves.toBe('PG-13');
    await expect(repo.getTrailerKey(identity)).resolves.toBe('Way9Dexny3w');
    await expect(repo.getMedia(identity)).resolves.toMatchObject({ id: 'tvdb:movie:290272', cast: [{ name: 'Timothee Chalamet' }] });
  });

  it('keeps provider-qualified identities distinct and tolerates a single failed provider', async () => {
    mockTvdbTrending();
    jest.spyOn(tvdbClient, 'filterSeries').mockResolvedValue({ data: [tvdbSeries(1, 'Show A', '2026-01-01', '2026', 700)], links: tvdbLinks(10) } as never);
    const trending = await new RemoteCatalogRepository().getTrending();
    // Same numeric ID, but movie vs series stay independent.
    expect(trending.map((item) => item.id).sort()).toEqual(['tvdb:movie:1', 'tvdb:movie:2', 'tvdb:series:1'].sort());
    jest.spyOn(tvdbClient, 'filterSeries').mockRejectedValue(new CatalogError('tvdb', 'network'));
    const partial = await new RemoteCatalogRepository().getTrending();
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.every((item) => item.provider === 'tvdb')).toBe(true);
  });

  it('throws a safe error only when every provider fails', async () => {
    jest.spyOn(tvdbClient, 'filterMovies').mockRejectedValue(new CatalogError('tvdb', 'network'));
    jest.spyOn(tvdbClient, 'filterSeries').mockRejectedValue(new CatalogError('tvdb', 'network'));
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

  it('home focuses on continue watching plus live catalog shelves', () => {
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toMatch(/Continue Watching/);
    expect(home).toMatch(/New Releases/);
    expect(home).toMatch(/Top 100/);
    expect(home).toMatch(/\/media\/\[id\]/);
    expect(home).not.toMatch(/Your Watchlist/);
    expect(home).not.toMatch(/Most Interested/);
    expect(home).not.toMatch(/Trending Now/);
    expect(home).not.toMatch(/Talk Of The Town/);
    expect(home).not.toMatch(/Bollywood/);
  });

  it('detail groups every action in one compact cluster with Moctale-style info', () => {
    const detail = readFileSync('app/media/[id].tsx', 'utf8');
    expect(detail).toMatch(/DetailActions/);
    expect(detail).toMatch(/Directed By/);
    expect(detail).toMatch(/Age Rating/);
    expect(detail).not.toMatch(/StatusPicker/);
    expect(detail).not.toMatch(/collections\/pick/);
    expect(detail).not.toMatch(/RatingSheet/);
  });
});

describe('metadata display names', () => {
  it('maps language and country codes to readable names with safe fallbacks', () => {
    expect(languageName('hi')).toBe('Hindi');
    expect(languageName('en')).toBe('English');
    expect(languageName('xx')).toBe('XX');
    expect(languageName(undefined)).toBeUndefined();
    expect(countryName('IN')).toBe('India');
    expect(countryName('US')).toBe('USA');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(undefined)).toBeUndefined();
  });
});
