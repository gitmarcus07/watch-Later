import type { CatalogMedia, CatalogSeason, MediaCastMember, MediaIdentity } from '@/domain/models/media';
import { mediaId } from '@/features/catalog/mediaIdentity';
import type {
  TvdbCharacterDto,
  TvdbEpisodeDto,
  TvdbFilterMovieDto,
  TvdbFilterSeriesDto,
  TvdbMovieDetailsDto,
  TvdbSearchItemDto,
  TvdbSeriesDetailsDto,
  TvdbTrailerDto,
} from './types';

const ARTWORK_BASE = 'https://artworks.thetvdb.com';
export const TVDB_ANIME_GENRE_ID = 27;

export function artworkUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ARTWORK_BASE}/${path.replace(/^\//, '')}`;
}

function yearAsNumber(value?: string | number | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const year = Number.parseInt(String(value).slice(0, 4), 10);
  return Number.isSafeInteger(year) && year >= 1800 && year <= 2200 ? year : undefined;
}

function yearAsString(value?: string | number | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

/** TVDB uses ISO 3166-1 alpha-3 codes (usa, esp); the app displays alpha-2 names. */
const COUNTRY3_TO_COUNTRY2: Record<string, string> = {
  usa: 'US', gbr: 'GB', can: 'CA', aus: 'AU', fra: 'FR', deu: 'DE', esp: 'ES',
  ita: 'IT', jpn: 'JP', kor: 'KR', chn: 'CN', hkg: 'HK', twn: 'TW', bra: 'BR',
  mex: 'MX', rus: 'RU', zaf: 'ZA', nga: 'NG', egy: 'EG', tur: 'TR', nld: 'NL',
  swe: 'SE', nor: 'NO', dnk: 'DK', fin: 'FI', pol: 'PL', cze: 'CZ', grc: 'GR',
  isr: 'IL', hun: 'HU', rou: 'RO', tha: 'TH', vnm: 'VN', idn: 'ID', mys: 'MY',
  phl: 'PH', sgp: 'SG', nzl: 'NZ', irl: 'IE', che: 'CH', aut: 'AT', bel: 'BE',
  arg: 'AR', col: 'CO', chl: 'CL', ukr: 'UA', ind: 'IN', prt: 'PT',
};

export function tvdbCountry(code?: string | null): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  if (/^[a-z]{2}$/.test(lower)) return lower.toUpperCase();
  return COUNTRY3_TO_COUNTRY2[lower] ?? lower.toUpperCase();
}

/** TVDB uses ISO 639-2 codes (eng, jpn); the app displays ISO 639-1 names. */
const ISO3_TO_ISO2: Record<string, string> = {
  eng: 'en', spa: 'es', fra: 'fre', deu: 'de', ita: 'it', por: 'pt', pt: 'pt',
  jpn: 'ja', kor: 'ko', zho: 'zh', zhtw: 'zh', chi: 'zh', hin: 'hi', rus: 'ru',
  ara: 'ar', tur: 'tr', nld: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi',
  pol: 'pl', ces: 'cs', ell: 'el', heb: 'he', hun: 'hu', ron: 'ro', tha: 'th',
  vie: 'vi', ind: 'id', msa: 'ms', tam: 'ta', tel: 'te', mal: 'ml', kan: 'kn',
  ben: 'bn', mar: 'mr', pan: 'pa', guj: 'gu', urd: 'ur', fas: 'fa', ukr: 'uk',
};

export function tvdbLanguage(code?: string | null): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase();
  return ISO3_TO_ISO2[lower] ?? lower;
}

function genreNames(genres?: { name?: string | null }[] | null): { name: string }[] {
  return (genres ?? [])
    .map((genre) => genre?.name?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name }));
}

export function isAnimeGenres(genres?: ({ name?: string | null } | string | null | undefined)[] | null): boolean {
  return (genres ?? []).some((genre) => {
    const name = typeof genre === 'string' ? genre : genre?.name;
    return name?.trim().toLowerCase() === 'anime';
  });
}

function studioNames(value?: ({ name?: string | null } | string | null)[] | null): string[] {
  return (value ?? [])
    .map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.name?.trim()))
    .filter((name): name is string => Boolean(name));
}

function statusName(status?: string | { name?: string | null } | null): string | undefined {
  if (!status) return undefined;
  return (typeof status === 'string' ? status : status.name)?.trim() || undefined;
}

function castFromCharacters(characters?: TvdbCharacterDto[] | null): { cast: MediaCastMember[]; directors: string[] } {
  const sorted = [...(characters ?? [])]
    .filter((member) => member !== null)
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));
  const cast: MediaCastMember[] = [];
  const directors: string[] = [];
  for (const member of sorted) {
    const role = (member.peopleType ?? '').toLowerCase();
    if (role === 'actor' || role === 'guest star') {
      const name = member.personName?.trim() || member.name?.trim();
      if (!name) continue;
      cast.push({
        name,
        character: member.name?.trim() && member.name.trim() !== name ? member.name.trim() : undefined,
        imageUrl: artworkUrl(member.image) ?? artworkUrl(member.personImgURL),
      });
    } else if (role === 'director' || role === 'co-director' || role === 'creator' || role === 'writer') {
      const name = member.personName?.trim() || member.name?.trim();
      if (name && !directors.includes(name)) directors.push(name);
    }
    if (cast.length >= 20 && directors.length >= 3) break;
  }
  return { cast, directors: directors.slice(0, 3) };
}

function contentRatingFrom(ratings?: { name?: string | null; country?: string | null }[] | null): string | undefined {
  if (!ratings?.length) return undefined;
  const pick = (country: string) =>
    ratings.find((entry) => entry?.country?.toLowerCase() === country)?.name?.trim();
  return pick('usa') || ratings.map((entry) => entry?.name?.trim()).find((name) => name) || undefined;
}

export function youtubeKeyFromTrailers(trailers?: TvdbTrailerDto[] | null): string | undefined {  const list = (trailers ?? []).filter((trailer) => trailer?.url);
  const pick =
    list.find((trailer) => trailer.language?.toLowerCase() === 'eng' && /trailer/i.test(trailer.name ?? '')) ??
    list.find((trailer) => trailer.language?.toLowerCase() === 'eng') ??
    list[0];
  const url = pick?.url;
  if (!url) return undefined;
  const watch = /[?&]v=([\w-]{6,})/.exec(url)?.[1];
  if (watch) return watch;
  const short = /youtu\.be\/([\w-]{6,})/.exec(url)?.[1];
  if (short) return short;
  const embed = /youtube\.com\/(?:embed|shorts)\/([\w-]{6,})/.exec(url)?.[1];
  return embed;
}

function movieReleaseDate(dto: TvdbMovieDetailsDto): string | undefined {
  const releases = (dto.releases ?? []).filter((entry) => entry?.date);
  const pick =
    releases.find((entry) => entry.country?.toLowerCase() === 'usa') ??
    [...releases].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  return pick?.date?.slice(0, 10) ?? yearAsString(dto.year);
}

/** TMDb numeric id bridged from TVDB remote IDs (unlocks ratings + providers). */
export function tmdbRefIdFrom(remoteIds?: { id?: string | null; sourceName?: string | null }[] | null): string | undefined {
  const hit = (remoteIds ?? []).find(
    (entry) => entry?.sourceName?.toLowerCase().includes('themoviedb') && /^\d+$/.test(entry?.id ?? ''),
  );
  return hit?.id ?? undefined;
}

export function mapTvdbMovie(dto: TvdbMovieDetailsDto): CatalogMedia {
  const identity: MediaIdentity = { provider: 'tvdb', mediaType: 'movie', providerId: String(dto.id) };
  const { cast, directors } = castFromCharacters(dto.characters);
  return {
    ...identity,
    id: mediaId(identity),
    title: dto.name?.trim() || `Movie ${dto.id}`,
    overview: dto.overview?.trim() || undefined,
    posterUrl: artworkUrl(dto.image),
    releaseDate: movieReleaseDate(dto),
    year: yearAsNumber(dto.year),
    genres: genreNames(dto.genres),
    runtimeMinutes: typeof dto.runtime === 'number' && dto.runtime > 0 ? dto.runtime : undefined,
    status: statusName(dto.status),
    language: tvdbLanguage(dto.originalLanguage),
    originCountries: tvdbCountry(dto.originalCountry) ? [tvdbCountry(dto.originalCountry) as string] : undefined,
    studios: studioNames(dto.studios),
    episodeMetadata: 'unavailable',
    cast,
    directors,
    contentRating: contentRatingFrom(dto.contentRatings),
    trailerKey: youtubeKeyFromTrailers(dto.trailers),
    tmdbRefId: tmdbRefIdFrom(dto.remoteIds),
  };
}

export function mapTvdbSeries(dto: TvdbSeriesDetailsDto, mediaType: 'series' | 'anime'): CatalogMedia {
  const identity: MediaIdentity = { provider: 'tvdb', mediaType, providerId: String(dto.id) };
  const { cast, directors } = castFromCharacters(dto.characters);
  const seasons = seriesSeasonSummaries(dto);
  return {
    ...identity,
    id: mediaId(identity),
    title: dto.name?.trim() || `Series ${dto.id}`,
    overview: dto.overview?.trim() || undefined,
    posterUrl: artworkUrl(dto.image),
    releaseDate: dto.firstAired?.slice(0, 10) || yearAsString(dto.year),
    year: yearAsNumber(dto.year),
    genres: genreNames(dto.genres),
    runtimeMinutes: typeof dto.averageRuntime === 'number' && dto.averageRuntime > 0 ? dto.averageRuntime : undefined,
    status: statusName(dto.status),
    language: tvdbLanguage(dto.originalLanguage),
    originCountries: tvdbCountry(dto.originalCountry) ? [tvdbCountry(dto.originalCountry) as string] : undefined,
    numberOfSeasons: seasons.length || undefined,
    seasonSummaries: seasons,
    studios: studioNames(dto.originalNetwork ? [{ name: dto.originalNetwork.name }] : null),
    episodeMetadata: 'available',
    cast,
    directors,
    contentRating: contentRatingFrom(dto.contentRatings),
    trailerKey: youtubeKeyFromTrailers(dto.trailers),
    tmdbRefId: tmdbRefIdFrom(dto.remoteIds),
  };
}

/** Official (aired-order) seasons, specials excluded — same shape as shows. */
export function seriesSeasonSummaries(dto: TvdbSeriesDetailsDto): { seasonNumber: number; name: string; posterUrl?: string }[] {
  const seasons = dto.seasons ?? [];
  const official = seasons.filter((season) =>
    season !== null &&
    Number.isSafeInteger(season.number) &&
    (season.number as number) > 0 &&
    (dto.defaultSeasonType === undefined ||
      dto.defaultSeasonType === null ||
      season.type?.id === dto.defaultSeasonType ||
      season.type?.name === 'Aired Order'),
  );
  const list = official.length ? official : seasons.filter((season) => season !== null && Number.isSafeInteger(season.number) && (season.number as number) > 0);
  return [...list]
    .sort((a, b) => (a.number as number) - (b.number as number))
    .map((season) => ({
      seasonNumber: season.number as number,
      name: `Season ${season.number}`,
      posterUrl: artworkUrl(season.image),
    }));
}

export function mapTvdbSeason(
  identity: MediaIdentity,
  seasonNumber: number,
  episodes: { providerId: string; episodeNumber: number; title: string; overview?: string; airDate?: string; stillUrl?: string; runtimeMinutes?: number }[],
): CatalogSeason {
  return {
    series: identity,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    episodes: episodes.map((episode) => ({
      provider: 'tvdb' as const,
      mediaType: identity.mediaType === 'anime' ? ('anime' as const) : ('series' as const),
      providerId: episode.providerId,
      seriesId: identity.providerId,
      seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      overview: episode.overview,
      airDate: episode.airDate,
      stillUrl: episode.stillUrl,
      runtimeMinutes: episode.runtimeMinutes,
    })),
  };
}

export function mapTvdbEpisodeDto(
  identity: MediaIdentity,
  seasonNumber: number,
  dto: TvdbEpisodeDto,
): { providerId: string; episodeNumber: number; title: string; overview?: string; airDate?: string; stillUrl?: string; runtimeMinutes?: number } | null {
  if (!Number.isSafeInteger(dto?.id) || !Number.isSafeInteger(dto?.number) || (dto.number as number) < 1) return null;
  return {
    providerId: String(dto.id),
    episodeNumber: dto.number as number,
    title: dto.name?.trim() || `Episode ${dto.number}`,
    overview: dto.overview?.trim() || undefined,
    airDate: dto.aired?.slice(0, 10) || undefined,
    stillUrl: artworkUrl(dto.image),
    runtimeMinutes: typeof dto.runtime === 'number' && dto.runtime > 0 ? dto.runtime : undefined,
  };
}

function tvdbIdFromObjectId(objectID?: string | null): string | undefined {
  if (!objectID) return undefined;
  const parts = objectID.split('-');
  const id = parts[parts.length - 1];
  return /^\d+$/.test(id ?? '') ? id : undefined;
}

export function mapTvdbSearchItem(dto: TvdbSearchItemDto): CatalogMedia | null {
  const providerId = tvdbIdFromObjectId(dto.objectID) ?? (dto.tvdb_id !== undefined && dto.tvdb_id !== null ? String(dto.tvdb_id) : undefined);
  if (!providerId) return null;
  const title = dto.name?.trim();
  if (!title) return null;
  if (dto.type === 'movie') {
    const identity: MediaIdentity = { provider: 'tvdb', mediaType: 'movie', providerId };
    return {
      ...identity,
      id: mediaId(identity),
      title,
      overview: dto.overview?.trim() || undefined,
      posterUrl: artworkUrl(dto.image_url) ?? artworkUrl(dto.thumbnail),
      releaseDate: yearAsString(dto.year),
      year: yearAsNumber(dto.year),
      genres: (dto.genres ?? []).filter((name): name is string => Boolean(name?.trim())).map((name) => ({ name: name.trim() })),
      status: statusName(dto.status),
      language: tvdbLanguage(dto.primary_language),
      originCountries: tvdbCountry(dto.country) ? [tvdbCountry(dto.country) as string] : undefined,
      studios: studioNames(dto.studios),
      episodeMetadata: 'unavailable',
      directors: dto.director?.trim() ? [dto.director.trim()] : undefined,
    };
  }
  if (dto.type === 'series') {
    const mediaType = isAnimeGenres(dto.genres) ? 'anime' : 'series';
    const identity: MediaIdentity = { provider: 'tvdb', mediaType, providerId };
    return {
      ...identity,
      id: mediaId(identity),
      title,
      overview: dto.overview?.trim() || undefined,
      posterUrl: artworkUrl(dto.image_url) ?? artworkUrl(dto.thumbnail),
      releaseDate: dto.firstAired?.slice(0, 10) || yearAsString(dto.year),
      year: yearAsNumber(dto.year),
      genres: (dto.genres ?? []).filter((name): name is string => Boolean(name?.trim())).map((name) => ({ name: name.trim() })),
      status: statusName(dto.status),
      language: tvdbLanguage(dto.primary_language),
      originCountries: tvdbCountry(dto.country) ? [tvdbCountry(dto.country) as string] : undefined,
      studios: studioNames(dto.studios),
      episodeMetadata: 'available',
      directors: dto.director?.trim() ? [dto.director.trim()] : undefined,
    };
  }
  return null;
}

export function mapTvdbFilterMovie(dto: TvdbFilterMovieDto): CatalogMedia | null {
  if (!Number.isSafeInteger(dto?.id) || !dto?.name?.trim()) return null;
  const identity: MediaIdentity = { provider: 'tvdb', mediaType: 'movie', providerId: String(dto.id) };
  return {
    ...identity,
    id: mediaId(identity),
    title: dto.name.trim(),
    posterUrl: artworkUrl(dto.image),
    releaseDate: yearAsString(dto.year),
    year: yearAsNumber(dto.year),
    genres: [],
    runtimeMinutes: typeof dto.runtime === 'number' && dto.runtime > 0 ? dto.runtime : undefined,
    status: statusName(dto.status),
    popularity: typeof dto.score === 'number' ? dto.score : undefined,
    episodeMetadata: 'unavailable',
  };
}

export function mapTvdbFilterSeries(dto: TvdbFilterSeriesDto, mediaType: 'series' | 'anime' = 'series'): CatalogMedia | null {
  if (!Number.isSafeInteger(dto?.id) || !dto?.name?.trim()) return null;
  const identity: MediaIdentity = { provider: 'tvdb', mediaType, providerId: String(dto.id) };
  return {
    ...identity,
    id: mediaId(identity),
    title: dto.name.trim(),
    overview: dto.overview?.trim() || undefined,
    posterUrl: artworkUrl(dto.image),
    releaseDate: dto.firstAired?.slice(0, 10) || yearAsString(dto.year),
    year: yearAsNumber(dto.year),
    genres: [],
    runtimeMinutes: typeof dto.averageRuntime === 'number' && dto.averageRuntime > 0 ? dto.averageRuntime : undefined,
    status: statusName(dto.status),
    language: tvdbLanguage(dto.originalLanguage),
    originCountries: tvdbCountry(dto.originalCountry) ? [tvdbCountry(dto.originalCountry) as string] : undefined,
    popularity: typeof dto.score === 'number' ? dto.score : undefined,
    episodeMetadata: 'available',
  };
}
