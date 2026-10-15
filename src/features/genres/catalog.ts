export interface GenreEntry {
  id: number;
  name: string;
  slug: string;
  /** Card gradient: [glow corner, deep corner] — each genre owns a hue. */
  gradient: readonly [string, string];
}

/**
 * The genre grid, exactly as the reference browse screen lists it: TMDb's
 * movie genre ids in alphabetical order. The same ids drive the discover
 * queries for movies and shows, so every tile opens one consistent shelf.
 * Each card carries its identity through a vivid two-stop gradient — a bright
 * hue at the glow corner melting into a deep tone of the same family, so the
 * whole card stays colored instead of fading into the dark background.
 */
export const GENRES: GenreEntry[] = [
  { id: 28, name: 'Action', slug: 'action', gradient: ['#E63946', '#7A1420'] },
  { id: 12, name: 'Adventure', slug: 'adventure', gradient: ['#12B886', '#0B4F42'] },
  { id: 16, name: 'Animation', slug: 'animation', gradient: ['#845EF7', '#3B1E77'] },
  { id: 35, name: 'Comedy', slug: 'comedy', gradient: ['#F5C518', '#8A6D0B'] },
  { id: 80, name: 'Crime', slug: 'crime', gradient: ['#4DABF7', '#173A5E'] },
  { id: 99, name: 'Documentary', slug: 'documentary', gradient: ['#ADB5BD', '#3D444C'] },
  { id: 18, name: 'Drama', slug: 'drama', gradient: ['#E8845B', '#6B2E17'] },
  { id: 10751, name: 'Family', slug: 'family', gradient: ['#FFA94D', '#99460F'] },
  { id: 14, name: 'Fantasy', slug: 'fantasy', gradient: ['#9775FA', '#3B2470'] },
  { id: 36, name: 'History', slug: 'history', gradient: ['#D4A72C', '#6B5210'] },
  { id: 27, name: 'Horror', slug: 'horror', gradient: ['#A5243A', '#33090F'] },
  { id: 10402, name: 'Music', slug: 'music', gradient: ['#F06595', '#8A1C4E'] },
  { id: 9648, name: 'Mystery', slug: 'mystery', gradient: ['#7950F2', '#2A1663'] },
  { id: 10749, name: 'Romance', slug: 'romance', gradient: ['#FF6B8A', '#8F1D3E'] },
  { id: 878, name: 'Science Fiction', slug: 'science-fiction', gradient: ['#22B8CF', '#0E4F5C'] },
  { id: 53, name: 'Thriller', slug: 'thriller', gradient: ['#4C6EF5', '#1B2B66'] },
  { id: 10770, name: 'TV Movie', slug: 'tv-movie', gradient: ['#5C7CFA', '#1F3366'] },
  { id: 10752, name: 'War', slug: 'war', gradient: ['#9AA832', '#3E4510'] },
  { id: 37, name: 'Western', slug: 'western', gradient: ['#DA7B3F', '#6E3510'] },
];

export function genreById(genreId: number): GenreEntry | undefined {
  return GENRES.find((entry) => entry.id === genreId);
}

/**
 * AniList's genre for one TMDb genre id:
 * - an exact name from AniList's own GenreCollection,
 * - `'all'` when every AniList title qualifies (everything AniList carries
 *   is animation, so the Animation shelf shows the popular anime feed),
 * - `null` when AniList tags nothing for it (Crime, Documentary, Family,
 *   History, TV Movie, War, Western) — the anime shelf reports honestly
 *   empty rather than pretending.
 */
const ANILIST_GENRE_BY_TMDB_ID: Record<number, 'all' | string | null> = {
  28: 'Action',
  12: 'Adventure',
  16: 'all',
  35: 'Comedy',
  80: null,
  99: null,
  18: 'Drama',
  10751: null,
  14: 'Fantasy',
  36: null,
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10770: null,
  10752: null,
  37: null,
};

/** `undefined` only for an unknown genre id (screens guard on `genreById`). */
export function anilistGenreFor(genreId: number): 'all' | string | null | undefined {
  return ANILIST_GENRE_BY_TMDB_ID[genreId];
}

/**
 * TMDb's TV genre ids for one grid genre — the TV list is its own taxonomy
 * (Action & Adventure, Sci-Fi & Fantasy, War & Politics…). Genres TMDb never
 * tags on TV borrow the umbrella their shows overwhelmingly carry, so the
 * Shows shelf stays useful instead of going blank; `null` means genuinely
 * nothing (TV Movie has no TV counterpart) and honestly reports empty.
 */
const TV_GENRE_IDS_BY_TMDB_ID: Record<number, string | null> = {
  28: '10759',
  12: '10759',
  16: '16',
  35: '35',
  80: '80',
  99: '99',
  18: '18',
  10751: '10751',
  14: '10765',
  36: '18',
  27: '9648,18',
  10402: '35,18',
  9648: '9648',
  10749: '18',
  878: '10765',
  53: '18,9648',
  10770: null,
  10752: '10768',
  37: '37',
};

/** Comma-joined TV genre ids for discover/tv. `undefined` only for unknown ids. */
export function tvGenreIdsFor(genreId: number): string | null | undefined {
  return TV_GENRE_IDS_BY_TMDB_ID[genreId];
}
