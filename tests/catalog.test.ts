import { CatalogError } from '@/domain/errors/CatalogError';
import { mapAniListAnime, plainDescription } from '@/data/remote/anilist/mappers';
import { anilistClient } from '@/data/remote/anilist/client';
import { imageUrl } from '@/data/remote/catalog/config';
import { requestJson } from '@/data/remote/catalog/request';
import { RemoteCatalogRepository, mergeCatalogResults } from '@/data/remote/catalog/RemoteCatalogRepository';
import { mapTmdbMovie, mapTmdbSeason, mapTmdbTv } from '@/data/remote/tmdb/mappers';
import { buildTmdbUrl, tmdbClient } from '@/data/remote/tmdb/client';
import { mediaId, parseMediaRouteId } from '@/features/catalog/mediaIdentity';

const movieDto = {
  id: 42, title: 'A Film', original_title: 'Un Film', overview: 'A story', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg',
  release_date: '2024-03-01', genres: [{ id: 7, name: 'Drama' }], vote_average: 8.2, vote_count: 120, runtime: 105,
  status: 'Released', original_language: 'fr', production_countries: [{ iso_3166_1: 'FR', name: 'France' }],
};

const animeDto = {
  id: 42, title: { english: 'A Film', romaji: 'A Firu', native: '映画' }, description: '<p>Bright &amp; bold<br>story</p>',
  coverImage: { extraLarge: 'https://img.example/cover.jpg' }, bannerImage: null,
  startDate: { year: 2024, month: 2, day: 10 }, season: 'WINTER', seasonYear: 2024, format: 'TV', status: 'FINISHED',
  episodes: 12, duration: 24, genres: ['Drama', null], averageScore: 81, popularity: 900, studios: { nodes: [{ name: 'Studio A' }, null] },
};

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

describe('catalog domain mapping and identity', () => {
  it('maps TMDb movie fields and provider-qualified identity', () => {
    const media = mapTmdbMovie(movieDto);
    expect(media.id).toBe('tmdb:movie:42');
    expect(media.providerId).toBe('42');
    expect(media.mediaType).toBe('movie');
    expect(media.year).toBe(2024);
    expect(media.genres).toEqual([{ id: 7, name: 'Drama' }]);
    expect(media.posterUrl).toContain('/w500/poster.jpg');
    expect(media.runtimeMinutes).toBe(105);
    expect(parseMediaRouteId(mediaId(media))).toEqual({ provider: 'tmdb', mediaType: 'movie', providerId: '42' });
    expect(parseMediaRouteId('anilist:anime:42')?.provider).toBe('anilist');
    expect(mediaId(media)).not.toBe('anilist:anime:42');
  });

  it('maps TV metadata and excludes the special-season entry', () => {
    const media = mapTmdbTv({ id: 5, name: 'Series', first_air_date: '2020-01-02', number_of_seasons: 2, number_of_episodes: 18,
      seasons: [{ season_number: 0, name: 'Specials' }, { season_number: 1, name: 'Season 1', episode_count: 10, poster_path: '/season.jpg' }] });
    expect(media.id).toBe('tmdb:series:5');
    expect(media.numberOfSeasons).toBe(2);
    expect(media.seasonSummaries).toHaveLength(1);
    expect(media.seasonSummaries?.[0].seasonNumber).toBe(1);
  });

  it('maps seasons and episodes without adding watched state', () => {
    const series = { provider: 'tmdb', mediaType: 'series', providerId: '5' } as const;
    const season = mapTmdbSeason({ id: 12, season_number: 1, name: 'Season 1', episodes: [{ id: 31, episode_number: 1, name: 'Pilot', air_date: '2020-01-02', still_path: '/still.jpg', runtime: 43 }] }, series);
    expect(season.episodes[0]).toMatchObject({ provider: 'tmdb', providerId: '31', seriesId: '5', seasonNumber: 1, episodeNumber: 1, title: 'Pilot', runtimeMinutes: 43 });
    expect(season.episodes[0].stillUrl).toContain('/w780/still.jpg');
    expect(season.episodes[0]).not.toHaveProperty('watched');
  });

  it('maps AniList fields safely and strips HTML descriptions', () => {
    expect(plainDescription('<p>Hello <b>there</b></p>&nbsp;World')).toBe('Hello there\n\n World');
    const media = mapAniListAnime(animeDto);
    expect(media.id).toBe('anilist:anime:42');
    expect(media.title).toBe('A Film');
    expect(media.originalTitle).toBe('映画');
    expect(media.overview).toBe('Bright & bold\nstory');
    expect(media.genres).toEqual([{ name: 'Drama' }]);
    expect(media.rating).toBe(8.1);
    expect(media.numberOfEpisodes).toBe(12);
    expect(media.episodeMetadata).toBe('unavailable');
    expect(mapAniListAnime({ id: 7 }).title).toBe('Anime 7');
  });

  it('builds safe image URLs for absent and present provider paths', () => {
    expect(imageUrl(null)).toBeUndefined();
    expect(imageUrl('/p.jpg')).toContain('p.jpg');
    expect(imageUrl('/b.jpg', 'backdrop')).toContain('/w780/b.jpg');
    expect(parseMediaRouteId('tmdb:anime:42')).toBeUndefined();
    expect(parseMediaRouteId('anilist:movie:42')).toBeUndefined();
  });

  it('merges duplicate normalized titles while preserving distinct titles', () => {
    const movie = mapTmdbMovie(movieDto);
    const anime = mapAniListAnime(animeDto);
    const other = mapTmdbMovie({ ...movieDto, id: 43, title: 'Another Film', release_date: '2022-01-01' });
    expect(mergeCatalogResults([[movie], [anime, other]]).map((item) => item.id)).toEqual([movie.id, other.id]);
  });
});

describe('catalog request and provider clients', () => {
  beforeEach(() => { jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unmocked network request blocked by catalog test')); });
  afterEach(() => jest.restoreAllMocks());

  it('maps HTTP and network failures into safe catalog errors', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited'], [503, 'server']] as const) {
      fetchSpy.mockResolvedValueOnce(response({}, status));
      await expect(requestJson('tmdb', 'https://example.invalid/search')).rejects.toMatchObject({ code, status });
    }
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('internal network details'));
    await expect(requestJson('anilist', 'https://example.invalid/graphql')).rejects.toMatchObject({ code: 'network', userMessage: expect.not.stringContaining('internal network details') });
  });

  it('handles invalid JSON and AniList GraphQL errors', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } } as unknown as Response);
    await expect(requestJson('tmdb', 'https://example.invalid')).rejects.toMatchObject({ code: 'invalid_response' });
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ errors: [{ message: 'private provider error detail' }] }));
    await expect(anilistClient.searchAnime('test')).rejects.toBeInstanceOf(CatalogError);
  });

  it('times out stalled requests without leaking low-level details', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')));
    }));
    const pending = requestJson('tmdb', 'https://example.invalid/slow');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(12_100);
    await assertion;
    jest.useRealTimers();
  });

  it('returns a controlled missing-key error without making a request', async () => {
    expect(() => buildTmdbUrl('search/movie', {}, undefined)).toThrow(expect.objectContaining({ code: 'configuration' }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('parses a successful AniList search response through fetch without internet', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ data: { Page: { media: [animeDto] } } }));
    await expect(anilistClient.searchAnime('A Film')).resolves.toMatchObject([{ id: 42, title: animeDto.title }]);
  });

  it('normalizes provider results and propagates all-provider failures', async () => {
    const repo = new RemoteCatalogRepository();
    const movie = mapTmdbMovie(movieDto);
    const movieSpy = jest.spyOn(tmdbClient, 'searchMovies').mockResolvedValue({ results: [movieDto] });
    jest.spyOn(tmdbClient, 'searchTv').mockResolvedValue({ results: [] });
    jest.spyOn(anilistClient, 'searchAnime').mockResolvedValue([animeDto]);
    const result = await repo.search('A Film', 'all');
    expect(result.items).toEqual([movie]);
    expect(result.unavailableProviders).toEqual([]);
    expect(movieSpy).toHaveBeenCalledWith('A Film', undefined);
    jest.spyOn(tmdbClient, 'searchMovies').mockRejectedValue(new CatalogError('tmdb', 'configuration'));
    jest.spyOn(tmdbClient, 'searchTv').mockRejectedValue(new CatalogError('tmdb', 'configuration'));
    jest.spyOn(anilistClient, 'searchAnime').mockRejectedValue(new CatalogError('anilist', 'network'));
    await expect(repo.search('A Film', 'all')).rejects.toMatchObject({ code: 'configuration' });
  });

  it('returns empty results without any provider request for whitespace', async () => {
    const searchMovie = jest.spyOn(tmdbClient, 'searchMovies');
    const result = await new RemoteCatalogRepository().search('  ', 'all');
    expect(result).toEqual({ items: [], unavailableProviders: [] });
    expect(searchMovie).not.toHaveBeenCalled();
  });

  it('loads provider-specific details and season episodes through the repository', async () => {
    const repo = new RemoteCatalogRepository();
    jest.spyOn(tmdbClient, 'getMovie').mockResolvedValue(movieDto);
    const identity = { provider: 'tmdb', mediaType: 'movie', providerId: '42' } as const;
    await expect(repo.getMedia(identity)).resolves.toMatchObject({ id: 'tmdb:movie:42', title: 'A Film' });
    jest.spyOn(tmdbClient, 'getSeason').mockResolvedValue({ id: 1, season_number: 1, name: 'Season 1', episodes: [{ id: 90, episode_number: 1, name: 'Pilot' }] });
    await expect(repo.getSeason({ provider: 'tmdb', mediaType: 'series', providerId: '9' }, 1)).resolves.toMatchObject({ episodes: [{ providerId: '90', title: 'Pilot' }] });
    await expect(repo.getSeason({ provider: 'anilist', mediaType: 'anime', providerId: '42' }, 1)).rejects.toMatchObject({ code: 'metadata_unavailable' });
  });
});
