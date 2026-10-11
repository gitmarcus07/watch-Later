import type { CatalogMedia, CatalogSeason, MediaEpisode, MediaIdentity, SeasonSummary } from '@/domain/models/media';
import { imageUrl } from '@/data/remote/catalog/config';
import { mediaId } from '@/features/catalog/mediaIdentity';
import type { TmdbMovieDto, TmdbSeasonDto, TmdbTvDto } from './types';

function yearFrom(date?: string): number | undefined {
  const year = date?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? Number(year) : undefined;
}

export function mapTmdbMovie(dto: TmdbMovieDto): CatalogMedia {
  const identity: MediaIdentity = { provider: 'tmdb', mediaType: 'movie', providerId: String(dto.id) };
  return {
    ...identity, id: mediaId(identity), title: dto.title, originalTitle: dto.original_title, overview: dto.overview || undefined,
    posterUrl: imageUrl(dto.poster_path), backdropUrl: imageUrl(dto.backdrop_path, 'backdrop'), releaseDate: dto.release_date || undefined,
    year: yearFrom(dto.release_date), genres: (dto.genres ?? []).map(({ id, name }) => ({ id, name })), rating: dto.vote_average,
    voteCount: dto.vote_count, runtimeMinutes: dto.runtime ?? undefined, status: dto.status, language: dto.original_language,
    originCountries: dto.production_countries?.map((country) => country.iso_3166_1), episodeMetadata: 'unavailable',
    imdbId: dto.imdb_id || undefined,
  };
}

export function mapTmdbTv(dto: TmdbTvDto): CatalogMedia {
  const identity: MediaIdentity = { provider: 'tmdb', mediaType: 'series', providerId: String(dto.id) };
  const seasons: SeasonSummary[] = (dto.seasons ?? []).filter((season) => season.season_number > 0).map((season) => ({
    seasonNumber: season.season_number, name: season.name, episodeCount: season.episode_count, airDate: season.air_date,
    posterUrl: imageUrl(season.poster_path),
  }));
  return {
    ...identity, id: mediaId(identity), title: dto.name, originalTitle: dto.original_name, overview: dto.overview || undefined,
    posterUrl: imageUrl(dto.poster_path), backdropUrl: imageUrl(dto.backdrop_path), releaseDate: dto.first_air_date || undefined,
    year: yearFrom(dto.first_air_date), genres: (dto.genres ?? []).map(({ id, name }) => ({ id, name })), rating: dto.vote_average,
    voteCount: dto.vote_count, runtimeMinutes: dto.episode_run_time?.[0], status: dto.status, language: dto.original_language,
    originCountries: dto.origin_country, numberOfSeasons: dto.number_of_seasons, numberOfEpisodes: dto.number_of_episodes,
    seasonSummaries: seasons, episodeMetadata: 'available',
    imdbId: dto.imdb_id || undefined,
  };
}

export function mapTmdbSeason(dto: TmdbSeasonDto, series: MediaIdentity): CatalogSeason {
  const episodes: MediaEpisode[] = (dto.episodes ?? []).map((episode) => ({
    provider: 'tmdb', mediaType: 'series', providerId: String(episode.id), seriesId: series.providerId,
    seasonNumber: dto.season_number, episodeNumber: episode.episode_number, title: episode.name,
    overview: episode.overview || undefined, airDate: episode.air_date || undefined,
    stillUrl: imageUrl(episode.still_path, 'still'), runtimeMinutes: episode.runtime ?? undefined, episodeType: episode.episode_type,
  }));
  return {
    series, seasonNumber: dto.season_number, name: dto.name, overview: dto.overview || undefined,
    airDate: dto.air_date, posterUrl: imageUrl(dto.poster_path), episodes,
  };
}
