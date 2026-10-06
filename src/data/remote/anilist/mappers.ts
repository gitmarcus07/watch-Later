import type { CatalogMedia, MediaIdentity } from '@/domain/models/media';
import { mediaId } from '@/features/catalog/mediaIdentity';
import type { AniListMediaDto } from './types';

export function plainDescription(value?: string | null): string | undefined {
  if (!value) return undefined;
  const plain = value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;|&#x27;/gi, "'")
    .trim();
  return plain || undefined;
}

export function mapAniListAnime(dto: AniListMediaDto): CatalogMedia {
  const identity: MediaIdentity = { provider: 'anilist', mediaType: 'anime', providerId: String(dto.id) };
  const title = dto.title?.english || dto.title?.romaji || dto.title?.native || `Anime ${dto.id}`;
  return {
    ...identity, id: mediaId(identity), title, originalTitle: dto.title?.native || dto.title?.romaji || undefined,
    overview: plainDescription(dto.description), posterUrl: dto.coverImage?.extraLarge || dto.coverImage?.large || undefined,
    backdropUrl: dto.bannerImage || undefined, releaseDate: dto.startDate?.year ? String(dto.startDate.year) : undefined,
    year: dto.startDate?.year ?? undefined, genres: (dto.genres ?? []).filter((genre): genre is string => Boolean(genre)).map((name) => ({ name })),
    rating: dto.averageScore == null ? undefined : dto.averageScore / 10, voteCount: dto.popularity ?? undefined,
    runtimeMinutes: dto.duration ?? undefined, status: dto.status ?? undefined, numberOfEpisodes: dto.episodes ?? undefined,
    animeFormat: dto.format ?? undefined, animeSeason: dto.season ? `${dto.season}${dto.seasonYear ? ` ${dto.seasonYear}` : ''}` : undefined,
    popularity: dto.popularity ?? undefined, studios: (dto.studios?.nodes ?? []).map((studio) => studio?.name).filter((name): name is string => Boolean(name)),
    episodeMetadata: 'unavailable',
  };
}
