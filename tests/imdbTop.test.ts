import { formatCompactCount } from '@/lib/format';
import { mapImdbRating, mapImdbRow, mixImdbTops, type ImdbTopItem } from '@/data/remote/supabase/imdbRatings';

describe('IMDb display helpers', () => {
  it('compacts vote counts', () => {
    expect(formatCompactCount(999)).toBe('999');
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(1500)).toBe('2K');
    expect(formatCompactCount(345678)).toBe('346K');
    expect(formatCompactCount(1234567)).toBe('1.2M');
    expect(formatCompactCount(2000000)).toBe('2M');
  });

  it('rejects missing or invalid counts', () => {
    expect(formatCompactCount(null)).toBeNull();
    expect(formatCompactCount(undefined)).toBeNull();
    expect(formatCompactCount(Number.NaN)).toBeNull();
    expect(formatCompactCount(-5)).toBeNull();
  });
});

describe('IMDb snapshot row mapping', () => {
  const row = {
    tmdb_id: 278,
    media_type: 'movie',
    imdb_id: 'tt0111161',
    title: 'The Shawshank Redemption',
    year: 1994,
    poster_url: 'https://image.tmdb.org/t/p/w342/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    rating: 9.3,
    votes: 2800000,
    list_rank: 1,
  };

  it('maps a valid snapshot row', () => {
    expect(mapImdbRow(row)).toEqual({
      rank: 1,
      tmdbId: 278,
      mediaType: 'movie',
      imdbId: 'tt0111161',
      title: 'The Shawshank Redemption',
      year: 1994,
      posterUrl: 'https://image.tmdb.org/t/p/w342/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
      rating: 9.3,
      votes: 2800000,
    });
  });

  it('rejects malformed rows instead of showing broken ranks', () => {
    expect(mapImdbRow({ ...row, list_rank: 0 })).toBeNull();
    expect(mapImdbRow({ ...row, list_rank: null })).toBeNull();
    expect(mapImdbRow({ ...row, rating: Number.NaN })).toBeNull();
    expect(mapImdbRow({ ...row, title: '' })).toBeNull();
    expect(mapImdbRow({ ...row, media_type: 'anime' })).toBeNull();
    expect(mapImdbRow({ ...row, year: null, poster_url: null })).toMatchObject({ year: undefined, posterUrl: undefined });
  });

  it('validates rating-only rows for card decoration', () => {
    expect(mapImdbRating({ rating: 7.3, votes: 851 })).toEqual({ rating: 7.3, votes: 851 });
    expect(mapImdbRating({ rating: Number.NaN, votes: 851 })).toBeNull();
    expect(mapImdbRating({ rating: 7.3, votes: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('mixes movies and series into one rating-ordered top 100', () => {
    const movie = (rank: number, rating: number, votes: number): ImdbTopItem => ({
      rank, tmdbId: rank, mediaType: 'movie', imdbId: `tt-m${rank}`, title: `Film ${rank}`,
      rating, votes,
    });
    const show = (rank: number, rating: number, votes: number): ImdbTopItem => ({
      rank, tmdbId: 1000 + rank, mediaType: 'series', imdbId: `tt-s${rank}`, title: `Show ${rank}`,
      rating, votes,
    });
    const mixed = mixImdbTops(
      [movie(1, 9.3, 100), movie(2, 8.0, 500)],
      [show(1, 9.5, 50), show(2, 8.0, 900)],
    );
    expect(mixed.map((item) => item.title)).toEqual(['Show 1', 'Film 1', 'Show 2', 'Film 2']);
    expect(mixImdbTops([movie(1, 9.0, 1)], [show(1, 9.0, 2)], 1).map((item) => item.title)).toEqual(['Show 1']);
    expect(mixImdbTops([], [])).toEqual([]);
  });
});
