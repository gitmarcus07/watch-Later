-- Per-episode anime tracking uses the same seasons/episodes UI as series, so
-- episode_watches must accept the anilist provider and anime media type.
-- Existing tmdb rows are untouched.

alter table public.episode_watches drop constraint if exists episode_watches_provider_check;
alter table public.episode_watches drop constraint if exists episode_watches_series_provider_check;
alter table public.episode_watches drop constraint if exists episode_watches_series_media_type_check;

alter table public.episode_watches
  add constraint episode_watches_provider_check check (provider in ('tmdb', 'anilist')),
  add constraint episode_watches_series_provider_check check (series_provider in ('tmdb', 'anilist')),
  add constraint episode_watches_series_media_type_check check (series_media_type in ('series', 'anime'));
