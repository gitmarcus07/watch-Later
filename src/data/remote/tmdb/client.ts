import { CatalogError } from '@/domain/errors/CatalogError';
import { catalogConfig, getTmdbApiKey } from '@/data/remote/catalog/config';
import { requestJson, withQuery } from '@/data/remote/catalog/request';
import type { TmdbListDto, TmdbMovieDto, TmdbSeasonDto, TmdbTvDto } from './types';

export function buildTmdbUrl(path: string, values: Record<string, string | number | undefined> = {}, apiKey = getTmdbApiKey()): string {
  if (!apiKey) throw new CatalogError('tmdb', 'configuration');
  return withQuery(`${catalogConfig.tmdbBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, { ...values, api_key: apiKey });
}

export const tmdbClient = {
  async searchMovies(query: string, signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbMovieDto>>('tmdb', buildTmdbUrl('search/movie', { query, include_adult: 'false' }), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async searchTv(query: string, signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbTvDto>>('tmdb', buildTmdbUrl('search/tv', { query }), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async getMovie(id: string, signal?: AbortSignal) {
    const response = await requestJson<TmdbMovieDto>('tmdb', buildTmdbUrl(`movie/${encodeURIComponent(id)}`), {}, signal);
    if (!response || !Number.isSafeInteger(response.id) || typeof response.title !== 'string') throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async getTv(id: string, signal?: AbortSignal) {
    const response = await requestJson<TmdbTvDto>('tmdb', buildTmdbUrl(`tv/${encodeURIComponent(id)}`), {}, signal);
    if (!response || !Number.isSafeInteger(response.id) || typeof response.name !== 'string') throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async getSeason(id: string, seasonNumber: number, signal?: AbortSignal) {
    const response = await requestJson<TmdbSeasonDto>('tmdb', buildTmdbUrl(`tv/${encodeURIComponent(id)}/season/${seasonNumber}`), {}, signal);
    if (!response || !Number.isSafeInteger(response.id) || !Number.isSafeInteger(response.season_number) || typeof response.name !== 'string') throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async trendingMovies(signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbMovieDto>>('tmdb', buildTmdbUrl('trending/movie/week'), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async trendingTv(signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbTvDto>>('tmdb', buildTmdbUrl('trending/tv/week'), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async nowPlayingMovies(signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbMovieDto>>('tmdb', buildTmdbUrl('movie/now_playing'), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
  async onTheAirTv(signal?: AbortSignal) {
    const response = await requestJson<TmdbListDto<TmdbTvDto>>('tmdb', buildTmdbUrl('tv/on_the_air'), {}, signal);
    if (!response || !Array.isArray(response.results)) throw new CatalogError('tmdb', 'invalid_response');
    return response;
  },
};
