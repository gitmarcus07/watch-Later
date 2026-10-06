-- Additive favorites table for authenticated users.
-- Custom lists and viewing history stay local-only in this phase.

create table if not exists public.favorite_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null,
  provider_id text not null,
  favorited_at timestamptz not null,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create index if not exists favorite_entries_user_updated_idx on public.favorite_entries(user_id, is_deleted, updated_at desc);

alter table public.favorite_entries enable row level security;

create policy "Favorites select own" on public.favorite_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "Favorites insert own" on public.favorite_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Favorites update own" on public.favorite_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Favorites delete own" on public.favorite_entries for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.favorite_entries to authenticated;
