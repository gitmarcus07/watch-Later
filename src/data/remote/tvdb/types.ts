export interface TvdbStatusDto {
  id?: number | null;
  name?: string | null;
}

export interface TvdbGenreDto {
  id?: number | null;
  name?: string | null;
  slug?: string | null;
}

export interface TvdbCharacterDto {
  id?: number | null;
  name?: string | null;
  personName?: string | null;
  peopleType?: string | null;
  image?: string | null;
  personImgURL?: string | null;
  sort?: number | null;
}

export interface TvdbTrailerDto {
  id?: number | null;
  name?: string | null;
  url?: string | null;
  language?: string | null;
}

export interface TvdbContentRatingDto {
  id?: number | null;
  name?: string | null;
  country?: string | null;
  description?: string | null;
}

export interface TvdbRemoteIdDto {
  id?: string | null;
  type?: number | null;
  sourceName?: string | null;
}

export interface TvdbSeasonDto {
  id?: number | null;
  seriesId?: number | null;
  type?: { id?: number | null; name?: string | null } | null;
  number?: number | null;
  image?: string | null;
}

export interface TvdbEpisodeDto {
  id?: number | null;
  seriesId?: number | null;
  name?: string | null;
  aired?: string | null;
  runtime?: number | null;
  overview?: string | null;
  image?: string | null;
  seasonNumber?: number | null;
  number?: number | null;
  absoluteNumber?: number | null;
  year?: string | null;
  finaleType?: string | null;
}

export interface TvdbMovieDetailsDto {
  id?: number | null;
  name?: string | null;
  overview?: string | null;
  image?: string | null;
  year?: string | number | null;
  genres?: TvdbGenreDto[] | null;
  runtime?: number | null;
  status?: TvdbStatusDto | null;
  originalLanguage?: string | null;
  originalCountry?: string | null;
  studios?: ({ name?: string | null } | string | null)[] | null;
  spoken_languages?: (string | null)[] | null;
  characters?: TvdbCharacterDto[] | null;
  trailers?: TvdbTrailerDto[] | null;
  contentRatings?: TvdbContentRatingDto[] | null;
  releases?: { country?: string | null; date?: string | null }[] | null;
  remoteIds?: TvdbRemoteIdDto[] | null;
}

export interface TvdbSeriesDetailsDto {
  id?: number | null;
  name?: string | null;
  overview?: string | null;
  image?: string | null;
  year?: string | number | null;
  firstAired?: string | null;
  genres?: TvdbGenreDto[] | null;
  averageRuntime?: number | null;
  status?: TvdbStatusDto | null;
  originalLanguage?: string | null;
  originalCountry?: string | null;
  originalNetwork?: { name?: string | null } | null;
  seasons?: TvdbSeasonDto[] | null;
  defaultSeasonType?: number | null;
  characters?: TvdbCharacterDto[] | null;
  trailers?: TvdbTrailerDto[] | null;
  contentRatings?: TvdbContentRatingDto[] | null;
  remoteIds?: TvdbRemoteIdDto[] | null;
}

export interface TvdbSearchItemDto {
  objectID?: string | null;
  type?: string | null;
  tvdb_id?: string | number | null;
  name?: string | null;
  overview?: string | null;
  image_url?: string | null;
  thumbnail?: string | null;
  year?: string | number | null;
  firstAired?: string | null;
  status?: string | TvdbStatusDto | null;
  genres?: (string | null)[] | null;
  director?: string | null;
  studios?: (string | null)[] | null;
  primary_language?: string | null;
  country?: string | null;
  slug?: string | null;
}

export interface TvdbFilterMovieDto {
  id?: number | null;
  name?: string | null;
  slug?: string | null;
  image?: string | null;
  score?: number | null;
  runtime?: number | null;
  status?: TvdbStatusDto | null;
  year?: string | number | null;
}

export interface TvdbFilterSeriesDto {
  id?: number | null;
  name?: string | null;
  slug?: string | null;
  image?: string | null;
  firstAired?: string | null;
  score?: number | null;
  status?: TvdbStatusDto | null;
  originalLanguage?: string | null;
  originalCountry?: string | null;
  averageRuntime?: number | null;
  overview?: string | null;
  year?: string | number | null;
}

export interface TvdbListResponse<T> {
  status?: string | null;
  data?: T[] | null;
  links?: { prev?: string | null; self?: string | null; next?: string | null; total_items?: number | null; page_size?: number | null } | null;
}

export interface TvdbSingleResponse<T> {
  status?: string | null;
  data?: T | null;
}

export interface TvdbSeriesEpisodesData {
  series?: TvdbSeriesDetailsDto | null;
  episodes?: TvdbEpisodeDto[] | null;
}
