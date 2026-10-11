-- Additive user ratings plus rewatch counters.
-- Ratings are independent rows: rating-only entries never imply watched state.

create table if not exists public.user_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null,
  provider_id text not null,
  rating double precision,
  thumbs smallint not null default 0 check (thumbs in (-1, 0, 1)),
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create index if not exists user_ratings_user_updated_idx on public.user_ratings(user_id, is_deleted, updated_at desc);

alter table public.user_ratings enable row level security;

create policy "Ratings select own" on public.user_ratings for select to authenticated using (user_id = (select auth.uid()));
create policy "Ratings insert own" on public.user_ratings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Ratings update own" on public.user_ratings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Ratings delete own" on public.user_ratings for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_ratings to authenticated;

alter table public.movie_watches add column if not exists rewatch_count integer not null default 0;
alter table public.episode_watches add column if not exists rewatch_count integer not null default 0;
