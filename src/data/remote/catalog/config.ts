export const catalogConfig = {
  tmdbApiKey: process.env.EXPO_PUBLIC_TMDB_API_KEY,
  tmdbBase: process.env.EXPO_PUBLIC_TMDB_BASE ?? 'https://api.themoviedb.org/3',
  tmdbImage: process.env.EXPO_PUBLIC_TMDB_IMAGE ?? 'https://image.tmdb.org/t/p/w500',
  anilistEndpoint: process.env.EXPO_PUBLIC_ANILIST_ENDPOINT ?? 'https://graphql.anilist.co',
  tvdbApiKey: process.env.EXPO_PUBLIC_TVDB_API_KEY,
  tvdbBase: process.env.EXPO_PUBLIC_TVDB_BASE ?? 'https://api4.thetvdb.com/v4',
};

export function getTmdbApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_TMDB_API_KEY || catalogConfig.tmdbApiKey;
}

export function getTvdbApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_TVDB_API_KEY || catalogConfig.tvdbApiKey;
}

export function imageUrl(path: string | null | undefined, size: 'poster' | 'backdrop' | 'still' = 'poster'): string | undefined {
  if (!path) return undefined;
  const target = size === 'backdrop' ? '/w780' : size === 'still' ? '/w300' : '/w500';
  const imageBase = catalogConfig.tmdbImage.replace(/\/$/, '').replace(/\/w500$/, target);
  return `${imageBase}/${path.replace(/^\//, '')}`;
}
