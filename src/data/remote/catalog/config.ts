export const catalogConfig = {
  tmdbApiKey: process.env.EXPO_PUBLIC_TMDB_API_KEY,
  tmdbBase: process.env.EXPO_PUBLIC_TMDB_BASE ?? 'https://api.themoviedb.org/3',
  tmdbImage: process.env.EXPO_PUBLIC_TMDB_IMAGE ?? 'https://image.tmdb.org/t/p/w500',
  anilistEndpoint: process.env.EXPO_PUBLIC_ANILIST_ENDPOINT ?? 'https://graphql.anilist.co',
};

export function getTmdbApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_TMDB_API_KEY || catalogConfig.tmdbApiKey;
}

export function imageUrl(path: string | null | undefined, size: 'poster' | 'backdrop' = 'poster'): string | undefined {
  if (!path) return undefined;
  const imageBase = catalogConfig.tmdbImage.replace(/\/$/, '').replace(/\/w500$/, size === 'backdrop' ? '/w780' : '/w500');
  return `${imageBase}/${path.replace(/^\//, '')}`;
}
