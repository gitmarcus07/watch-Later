-- Real user "Interested" marks for upcoming titles plus public aggregated counts.
-- Raw marks stay owner-scoped; counts are exposed via a security-definer function
-- so every user (including guests via anon) sees real totals without user ids.

create table if not exists public.interested_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  media_type text not null,
  provider_id text not null,
  title text not null default '',
  poster_url text,
  release_date text,
  marked_at timestamptz not null,
  is_deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, provider, media_type, provider_id),
  foreign key (user_id, provider, media_type, provider_id) references public.library_media(user_id, provider, media_type, provider_id) on delete cascade
);

create index if not exists interested_marks_user_updated_idx on public.interested_marks(user_id, is_deleted, updated_at desc);
create index if not exists interested_marks_counts_idx on public.interested_marks(provider, media_type, provider_id, is_deleted);

alter table public.interested_marks enable row level security;

create policy "Interested select own" on public.interested_marks for select to authenticated using (user_id = (select auth.uid()));
create policy "Interested insert own" on public.interested_marks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Interested update own" on public.interested_marks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Interested delete own" on public.interested_marks for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.interested_marks to authenticated;

-- Aggregated real counts: one row per title, no user ids exposed.
create or replace function public.get_interested_counts()
returns table (provider text, media_type text, provider_id text, interested_count bigint)
language sql
security definer
set search_path = public
as $$
  select provider, media_type, provider_id, count(*)::bigint as interested_count
  from public.interested_marks
  where is_deleted = false
  group by provider, media_type, provider_id;
$$;

grant execute on function public.get_interested_counts() to authenticated;
grant execute on function public.get_interested_counts() to anon;
