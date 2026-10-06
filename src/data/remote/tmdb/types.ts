export interface TmdbGenreDto { id: number; name: string }
export interface TmdbCountryDto { iso_3166_1: string; name: string }
export interface TmdbMovieDto {
  id: number; title: string; original_title?: string; overview?: string | null; poster_path?: string | null; backdrop_path?: string | null;
  release_date?: string; genre_ids?: number[]; genres?: TmdbGenreDto[]; vote_average?: number; vote_count?: number; runtime?: number | null;
  status?: string; original_language?: string; production_countries?: TmdbCountryDto[];
}
export interface TmdbTvDto {
  id: number; name: string; original_name?: string; overview?: string | null; poster_path?: string | null; backdrop_path?: string | null;
  first_air_date?: string; genre_ids?: number[]; genres?: TmdbGenreDto[]; vote_average?: number; vote_count?: number; episode_run_time?: number[];
  status?: string; original_language?: string; origin_country?: string[]; number_of_seasons?: number; number_of_episodes?: number;
  seasons?: { season_number: number; name: string; episode_count?: number; air_date?: string; poster_path?: string | null }[];
}
export interface TmdbListDto<T> { results: T[]; page?: number; total_pages?: number; total_results?: number }
export interface TmdbSeasonDto {
  id: number; season_number: number; name: string; overview?: string | null; air_date?: string; poster_path?: string | null;
  episodes?: { id: number; episode_number: number; name: string; overview?: string | null; air_date?: string; still_path?: string | null; runtime?: number | null; episode_type?: string }[];
}
