export interface TmdbGenreDto { id: number; name: string }
export interface TmdbCountryDto { iso_3166_1: string; name: string }
export interface TmdbMovieDto {
  id: number; title: string; original_title?: string; overview?: string | null; poster_path?: string | null; backdrop_path?: string | null;
  release_date?: string; genre_ids?: number[]; genres?: TmdbGenreDto[]; vote_average?: number; vote_count?: number; runtime?: number | null;
  status?: string; original_language?: string; production_countries?: TmdbCountryDto[]; imdb_id?: string | null; popularity?: number;
}
export interface TmdbTvDto {
  id: number; name: string; original_name?: string; overview?: string | null; poster_path?: string | null; backdrop_path?: string | null;
  first_air_date?: string; genre_ids?: number[]; genres?: TmdbGenreDto[]; vote_average?: number; vote_count?: number; episode_run_time?: number[];
  status?: string; original_language?: string; origin_country?: string[]; number_of_seasons?: number; number_of_episodes?: number; imdb_id?: string | null; popularity?: number;
  seasons?: { season_number: number; name: string; episode_count?: number; air_date?: string; poster_path?: string | null }[];
}
export interface TmdbListDto<T> { results: T[]; page?: number; total_pages?: number; total_results?: number }
/** Mixed trending/all/week entries: movie-shaped or tv-shaped, told apart by media_type. */
export type TmdbTrendingAllDto = (TmdbMovieDto & { media_type: 'movie' }) | (TmdbTvDto & { media_type: 'tv' });
export interface TmdbVideoDto { id: string; key: string; site?: string; type?: string; official?: boolean }
export interface TmdbVideosDto { results?: TmdbVideoDto[] }
export interface TmdbWatchProviderDto { provider_id: number; provider_name: string; logo_path?: string | null }
export interface TmdbWatchProvidersDto { results?: Record<string, { flatrate?: TmdbWatchProviderDto[]; rent?: TmdbWatchProviderDto[]; buy?: TmdbWatchProviderDto[] }> }
export interface TmdbSeasonDto {
  id: number; season_number: number; name: string; overview?: string | null; air_date?: string; poster_path?: string | null;
  episodes?: { id: number; episode_number: number; name: string; overview?: string | null; air_date?: string; still_path?: string | null; runtime?: number | null; episode_type?: string }[];
}
export interface TmdbCreditsDto {
  cast?: { name: string }[];
  crew?: { name: string; job?: string; department?: string }[];
}
export interface TmdbReleaseDatesDto {
  results?: { iso_3166_1: string; release_dates?: { certification?: string; type?: number }[] }[];
}
export interface TmdbContentRatingsDto {
  results?: { iso_3166_1: string; rating?: string }[];
}
