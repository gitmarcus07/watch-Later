-- IMDb Top 250 snapshot, refreshed weekly by the imdb-ratings GitHub Action
-- (official IMDb daily dumps + TMDB id mapping, no scraping). The app reads
-- this table directly: each row is self-contained (title/poster included) so
-- the toplist renders offline and without per-title API calls.

create table public.imdb_ratings (
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'series')),
  imdb_id text not null,
  title text not null,
  year integer null,
  poster_url text null,
  rating numeric(3, 1) not null,
  votes integer not null,
  list_rank integer not null,
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, media_type)
);

create index imdb_ratings_rank_idx on public.imdb_ratings (media_type, list_rank);

alter table public.imdb_ratings enable row level security;

-- Public reading material; writes happen server-side via the service role
-- (service key stays in GitHub secrets, never in the mobile app).
create policy "IMDb ratings readable by everyone"
  on public.imdb_ratings for select
  to anon, authenticated
  using (true);

grant select on public.imdb_ratings to anon, authenticated;
grant select, insert, update, delete on public.imdb_ratings to service_role;
