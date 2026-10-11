import { RemoteCatalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { tvdbClient, __resetTvdbClientForTests } from '@/data/remote/tvdb/client';
import {
  mapTvdbEpisodeDto,
  mapTvdbFilterMovie,
  mapTvdbFilterSeries,
  mapTvdbMovie,
  mapTvdbSearchItem,
  mapTvdbSeries,
  seriesSeasonSummaries,
} from '@/data/remote/tvdb/mappers';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

const extendedMovie = () => ({
  id: 290272,
  name: 'Dune: Part Two',
  overview: 'Paul unites with Chani.',
  image: 'https://artworks.thetvdb.com/banners/v4/movie/290272/posters/x.jpg',
  year: '2024',
  genres: [{ name: 'Drama' }, { name: 'Science Fiction' }],
  runtime: 167,
  status: { name: 'Released' },
  originalLanguage: 'eng',
  originalCountry: 'usa',
  studios: [{ name: 'Legendary Entertainment' }],
  characters: [
    { personName: 'Timothee Chalamet', name: 'Paul Atreides', peopleType: 'Actor', image: '/banners/v4/actor/1/photo/x.jpg', sort: 1 },
    { personName: 'Denis Villeneuve', name: 'Denis Villeneuve', peopleType: 'Director', sort: 50 },
  ],
  contentRatings: [{ name: 'PG-13', country: 'usa' }],
  trailers: [{ name: 'Trailer', url: 'https://www.youtube.com/watch?v=Way9Dexny3w', language: 'eng' }],
  releases: [{ country: 'fra', date: '2024-02-28' }, { country: 'usa', date: '2024-03-01' }],
});

const extendedSeries = () => ({
  id: 81189,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher breaks bad.',
  image: 'https://artworks.thetvdb.com/banners/posters/81189-1.jpg',
  year: '2008',
  firstAired: '2008-01-20',
  genres: [{ name: 'Drama' }],
  averageRuntime: 48,
  status: { name: 'Ended' },
  originalLanguage: 'eng',
  originalCountry: 'usa',
  seasons: [
    { id: 1, number: 0, image: '/banners/seasons/81189-0-1.jpg', type: { id: 1, name: 'Aired Order' } },
    { id: 2, number: 1, image: '/banners/seasons/81189-1-3.jpg', type: { id: 1, name: 'Aired Order' } },
    { id: 3, number: 2, image: '/banners/seasons/81189-2-1.jpg', type: { id: 1, name: 'Aired Order' } },
  ],
  defaultSeasonType: 1,
  characters: [{ personName: 'Bryan Cranston', name: 'Walter White', peopleType: 'Actor', image: null, personImgURL: null, sort: 1 }],
  contentRatings: [{ name: 'TV-MA', country: 'usa' }],
  trailers: [],
});

const episodes = () => [
  { id: 11, seriesId: 81189, name: 'Pilot', aired: '2008-01-20', runtime: 58, overview: 'Walt learns.', image: '/banners/episodes/81189/a.jpg', seasonNumber: 1, number: 1 },
  { id: 12, seriesId: 81189, name: "Cat's in the Bag", aired: '2008-01-27', runtime: 48, overview: null, image: null, seasonNumber: 1, number: 2 },
  { id: 13, seriesId: 81189, name: 'Seven Thirty-Seven', aired: '2009-03-08', runtime: 47, overview: null, image: null, seasonNumber: 2, number: 1 },
];

describe('tvdb catalog mapping', () => {
  it('maps search items to movies, series, and anime by genre', () => {
    const movie = mapTvdbSearchItem({ objectID: 'movie-290272', type: 'movie', tvdb_id: '290272', name: 'Dune: Part Two', year: '2024', genres: ['Drama'], status: 'Released', primary_language: 'eng', image_url: 'https://img.example/p.jpg' });
    expect(movie).toMatchObject({ id: 'tvdb:movie:290272', mediaType: 'movie', year: 2024, language: 'en' });
    const series = mapTvdbSearchItem({ objectID: 'series-81189', type: 'series', tvdb_id: '81189', name: 'Breaking Bad', year: '2008', genres: ['Drama'], status: 'Ended', primary_language: 'eng', image_url: 'https://img.example/p.jpg' });
    expect(series).toMatchObject({ id: 'tvdb:series:81189', mediaType: 'series' });
    const anime = mapTvdbSearchItem({ objectID: 'series-81797', type: 'series', tvdb_id: '81797', name: 'One Piece', year: '1999', genres: ['Anime', 'Action'], status: 'Continuing', primary_language: 'jpn', image_url: 'https://img.example/p.jpg' });
    expect(anime).toMatchObject({ id: 'tvdb:anime:81797', mediaType: 'anime', language: 'ja' });
    expect(mapTvdbSearchItem({ objectID: 'list-11', type: 'list', name: 'A list', year: '2020' })).toBeNull();
    expect(mapTvdbSearchItem({ objectID: 'movie-x', type: 'movie', name: 'No id', year: '2020' })).toBeNull();
  });

  it('maps extended movies with cast, directors, ratings, trailers, and release dates', () => {
    const media = mapTvdbMovie(extendedMovie() as never);
    expect(media).toMatchObject({
      id: 'tvdb:movie:290272', title: 'Dune: Part Two', year: 2024, runtimeMinutes: 167,
      releaseDate: '2024-03-01', status: 'Released', language: 'en',
      directors: ['Denis Villeneuve'], contentRating: 'PG-13', trailerKey: 'Way9Dexny3w',
    });
    expect(media.cast?.[0]).toMatchObject({ name: 'Timothee Chalamet', character: 'Paul Atreides' });
    expect(media.cast?.[0].imageUrl).toContain('https://artworks.thetvdb.com/');
    expect(media.studios).toEqual(['Legendary Entertainment']);
  });

  it('maps extended series with official seasons, specials excluded', () => {
    const dto = extendedSeries();
    expect(seriesSeasonSummaries(dto as never).map((summary) => summary.seasonNumber)).toEqual([1, 2]);
    const media = mapTvdbSeries(dto as never, 'series');
    expect(media).toMatchObject({
      id: 'tvdb:series:81189', releaseDate: '2008-01-20', status: 'Ended',
      language: 'en', directors: [], contentRating: 'TV-MA',
    });
    expect(media.numberOfSeasons).toBe(2);
  });

  it('maps episodes with stills and runtimes, rejecting bad rows', () => {
    const identity = { provider: 'tvdb', mediaType: 'series', providerId: '81189' } as const;
    const episode = mapTvdbEpisodeDto(identity, 1, episodes()[0] as never);
    expect(episode).toMatchObject({
      providerId: '11', episodeNumber: 1, title: 'Pilot', airDate: '2008-01-20',
      stillUrl: 'https://artworks.thetvdb.com/banners/episodes/81189/a.jpg', runtimeMinutes: 58,
    });
    expect(mapTvdbEpisodeDto(identity, 1, { id: 99, number: 0 } as never)).toBeNull();
  });

  it('maps filter rows with relative artwork and favorite-count popularity', () => {
    const movie = mapTvdbFilterMovie({ id: 466, name: 'Classic', year: '1972', score: 560194, status: { name: 'Released' }, image: '/banners/v4/movie/466/posters/x.jpg' });
    expect(movie).toMatchObject({ id: 'tvdb:movie:466', popularity: 560194 });
    expect(movie?.posterUrl).toBe('https://artworks.thetvdb.com/banners/v4/movie/466/posters/x.jpg');
    const series = mapTvdbFilterSeries({ id: 81189, name: 'Breaking Bad', firstAired: '2008-01-20', year: '2008', score: 3776757, status: { name: 'Ended' }, image: '/banners/posters/81189-1.jpg' }, 'series');
    expect(series).toMatchObject({ id: 'tvdb:series:81189', releaseDate: '2008-01-20', popularity: 3776757 });
    expect(mapTvdbFilterMovie({ id: null, name: 'Nope', year: '2020' })).toBeNull();
  });
});

describe('tvdb repository', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves movie detail without episode fetches', async () => {
    const episodesSpy = jest.spyOn(tvdbClient, 'getAllSeriesEpisodes');
    jest.spyOn(tvdbClient, 'getMovie').mockResolvedValue(extendedMovie() as never);
    const media = await new RemoteCatalogRepository().getMedia({ provider: 'tvdb', mediaType: 'movie', providerId: '290272' });
    expect(media).toMatchObject({ id: 'tvdb:movie:290272', title: 'Dune: Part Two' });
    expect(episodesSpy).not.toHaveBeenCalled();
  });

  it('resolves series detail with per-season counts and totals', async () => {
    jest.spyOn(tvdbClient, 'getSeries').mockResolvedValue(extendedSeries() as never);
    jest.spyOn(tvdbClient, 'getAllSeriesEpisodes').mockResolvedValue(episodes() as never);
    const media = await new RemoteCatalogRepository().getMedia({ provider: 'tvdb', mediaType: 'series', providerId: '81189' });
    expect(media.seasonSummaries?.map((summary) => [summary.seasonNumber, summary.episodeCount])).toEqual([[1, 2], [2, 1]]);
    expect(media.numberOfEpisodes).toBe(3);
  });

  it('resolves anime seasons from official numbering, same as shows', async () => {
    jest.spyOn(tvdbClient, 'getSeries').mockResolvedValue({
      ...extendedSeries(), id: 81797, name: 'One Piece', genres: [{ name: 'Anime' }],
    } as never);
    jest.spyOn(tvdbClient, 'getAllSeriesEpisodes').mockResolvedValue(episodes().map((episode) => ({ ...episode, seriesId: 81797 })) as never);
    const repo = new RemoteCatalogRepository();
    const season = await repo.getSeason({ provider: 'tvdb', mediaType: 'anime', providerId: '81797' }, 1);
    expect(season.episodes.map((episode) => episode.episodeNumber)).toEqual([1, 2]);
    expect(season.episodes[0]).toMatchObject({ provider: 'tvdb', mediaType: 'anime', stillUrl: expect.any(String) });
    await expect(repo.getSeason({ provider: 'tvdb', mediaType: 'anime', providerId: '81797' }, 9)).rejects.toMatchObject({ code: 'not_found' });
    const byRef = await repo.getAnimeSeasonByRef(
      { provider: 'tvdb', mediaType: 'anime', providerId: '81797' },
      { seasonNumber: 2, name: 'Season 2' },
    );
    expect(byRef.episodes.map((episode) => episode.title)).toEqual(['Seven Thirty-Seven']);
  });
});

describe('tvdb client auth and search', () => {
  beforeEach(() => {
    __resetTvdbClientForTests();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unmocked network request blocked by tvdb test'));
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs in once and filters non-title search hits', async () => {
    const previousKey = process.env.EXPO_PUBLIC_TVDB_API_KEY;
    process.env.EXPO_PUBLIC_TVDB_API_KEY = 'test-key';
    try {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const searchPage = {
        data: [
          { objectID: 'series-81189', type: 'series', tvdb_id: '81189', name: 'Breaking Bad', year: '2008' },
          { objectID: 'list-1', type: 'list', name: 'A list', year: '2020' },
        ],
      };
      fetchSpy.mockResolvedValueOnce(response({ data: { token: 'secret-token' } }));
      fetchSpy.mockResolvedValueOnce(response(searchPage));
      fetchSpy.mockResolvedValueOnce(response(searchPage));
      const first = await tvdbClient.search('Breaking Bad', 'series');
      expect(first.map((item) => item.objectID)).toEqual(['series-81189']);
      await tvdbClient.search('Breaking Bad', 'series');
      const logins = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith('/login'));
      expect(logins).toHaveLength(1);
    } finally {
      if (previousKey === undefined) delete process.env.EXPO_PUBLIC_TVDB_API_KEY;
      else process.env.EXPO_PUBLIC_TVDB_API_KEY = previousKey;
    }
  });
});
