-- India OTT release tracker: verified announcement records.
--
-- Read model: every client (anon + authenticated) can read verified rows so
-- the Upcoming on OTT screen and the details-section work without sign-in.
-- Write model: client keys can NEVER write. Only the service_role key (admin
-- dashboard / edge function / trusted operator machine) may insert, update,
-- or delete. There is intentionally no insert/update/delete policy for the
-- `anon` or `authenticated` roles, so unauthorized edits fail at the
-- database layer even if a client is tampered with.
--
-- Deploy: supabase link --project-ref <project-ref>, then supabase db push.
-- Admin writes: use the Supabase dashboard table editor or an edge function
-- running with the service-role key. Never ship the service-role key in the
-- Expo app.

create table if not exists public.ott_releases (
  id text primary key,
  provider text not null check (provider in ('tmdb', 'anilist', 'tvdb')),
  media_type text not null check (media_type in ('movie', 'series', 'anime')),
  provider_id text not null,
  movie_title text not null,
  platform text not null,
  platform_logo_url text,
  tmdb_provider_id integer,
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  theatrical_date text,
  ott_date text,
  date_precision text not null default 'unknown'
    check (date_precision in ('exact', 'month', 'year', 'unknown')),
  status text not null default 'unannounced'
    check (status in ('confirmed', 'expected', 'window_announced', 'platform_announced', 'unannounced', 'released')),
  source_url text,
  source_published_at timestamptz,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text,
  is_premiere boolean not null default true,
  unique (provider, media_type, provider_id, platform, country, is_premiere)
);

create index if not exists ott_releases_country_date_idx
  on public.ott_releases (country, ott_date);
create index if not exists ott_releases_media_idx
  on public.ott_releases (provider, media_type, provider_id, country);
create index if not exists ott_releases_platform_idx
  on public.ott_releases (country, platform);

alter table public.ott_releases enable row level security;

-- Public read access: verified announcements are catalog data, not user data.
create policy "OTT releases readable by everyone"
  on public.ott_releases for select to anon, authenticated using (true);

-- No insert/update/delete policies for anon/authenticated: only service_role
-- (which bypasses RLS) can write. Unauthorized client edits fail closed.

-- Table-level privileges (RLS policies alone are not enough — without these
-- every role gets HTTP 403 / 42501, including service_role).
grant select on public.ott_releases to anon, authenticated;
grant select, insert, update, delete on public.ott_releases to service_role;

-- Keep updated_at honest on admin writes.
create or replace function public.ott_releases_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ott_releases_touch_updated_at on public.ott_releases;
create trigger ott_releases_touch_updated_at
  before update on public.ott_releases
  for each row execute function public.ott_releases_touch_updated_at();
