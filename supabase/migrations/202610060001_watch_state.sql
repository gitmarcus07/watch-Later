create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_media (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('tmdb', 'anilist')),
  media_type text not null check (media_type in ('movie', 'series', 'anime')),
  provider_id text not null,
  title text not null,
  original_title text,
  overview text,
  poster_url text,
  backdrop_url text,
  release_date text,
  year integer,
  genres jsonb not null default '[]'::jsonb,
  number_of_seasons integer,
  number_of_episodes integer,
  season_summaries jsonb not null default '[]'::jsonb,
  episode_metadata text not null check (episode_metadata in ('available', 'unavailable')),
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id)
);

create table if not exists public.watchlist_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null,
  provider_id text not null,
  added_at timestamptz not null,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create table if not exists public.movie_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null check (media_type = 'movie'),
  provider_id text not null,
  watched_at timestamptz,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create table if not exists public.tracked_series (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null check (media_type in ('series', 'anime')),
  provider_id text not null,
  tracking_started_at timestamptz not null,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create table if not exists public.episode_watches (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'tmdb'),
  episode_provider_id text not null,
  series_provider text not null check (series_provider = 'tmdb'),
  series_media_type text not null check (series_media_type = 'series'),
  series_provider_id text not null,
  season_number integer not null check (season_number >= 0),
  episode_number integer not null check (episode_number >= 0),
  title text not null,
  overview text,
  air_date text,
  still_url text,
  runtime_minutes integer,
  watched_at timestamptz,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, episode_provider_id),
  unique (user_id, series_provider, series_provider_id, season_number, episode_number),
  foreign key (user_id, series_provider, series_media_type, series_provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create index if not exists library_media_user_updated_idx on public.library_media(user_id, updated_at desc);
create index if not exists watchlist_entries_user_updated_idx on public.watchlist_entries(user_id, is_deleted, updated_at desc);
create index if not exists movie_watches_user_updated_idx on public.movie_watches(user_id, is_deleted, updated_at desc);
create index if not exists tracked_series_user_updated_idx on public.tracked_series(user_id, is_deleted, updated_at desc);
create index if not exists episode_watches_series_order_idx on public.episode_watches(user_id, series_provider, series_provider_id, season_number, episode_number);

alter table public.profiles enable row level security;
alter table public.library_media enable row level security;
alter table public.watchlist_entries enable row level security;
alter table public.movie_watches enable row level security;
alter table public.tracked_series enable row level security;
alter table public.episode_watches enable row level security;

create policy "Profiles select own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Profiles insert own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "Profiles update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Profiles delete own" on public.profiles for delete to authenticated using (id = (select auth.uid()));

create policy "Library media select own" on public.library_media for select to authenticated using (user_id = (select auth.uid()));
create policy "Library media insert own" on public.library_media for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Library media update own" on public.library_media for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Library media delete own" on public.library_media for delete to authenticated using (user_id = (select auth.uid()));

create policy "Watchlist select own" on public.watchlist_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "Watchlist insert own" on public.watchlist_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Watchlist update own" on public.watchlist_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Watchlist delete own" on public.watchlist_entries for delete to authenticated using (user_id = (select auth.uid()));

create policy "Movie watches select own" on public.movie_watches for select to authenticated using (user_id = (select auth.uid()));
create policy "Movie watches insert own" on public.movie_watches for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Movie watches update own" on public.movie_watches for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Movie watches delete own" on public.movie_watches for delete to authenticated using (user_id = (select auth.uid()));

create policy "Tracked series select own" on public.tracked_series for select to authenticated using (user_id = (select auth.uid()));
create policy "Tracked series insert own" on public.tracked_series for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Tracked series update own" on public.tracked_series for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Tracked series delete own" on public.tracked_series for delete to authenticated using (user_id = (select auth.uid()));

create policy "Episode watches select own" on public.episode_watches for select to authenticated using (user_id = (select auth.uid()));
create policy "Episode watches insert own" on public.episode_watches for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Episode watches update own" on public.episode_watches for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Episode watches delete own" on public.episode_watches for delete to authenticated using (user_id = (select auth.uid()));
