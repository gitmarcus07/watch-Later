-- Global Hits published reports. One immutable row per calendar period.
-- Rows are written by the generate-global-hits edge function (service role)
-- and never updated afterwards: an existing published row is returned as-is,
-- so historical results cannot silently change.

create table public.global_hit_reports (
  period_type text not null check (period_type in ('month', 'year')),
  period_key text not null check (period_key ~ '^[0-9]{4}(-(0[1-9]|1[0-2]))?$'),
  generated_at timestamptz not null default now(),
  retrieved_at timestamptz not null,
  methodology text not null,
  status text not null default 'published' check (status = 'published'),
  movie_items jsonb not null default '[]'::jsonb,
  series_items jsonb not null default '[]'::jsonb,
  primary key (period_type, period_key)
);

alter table public.global_hit_reports enable row level security;

-- Reports are public reading material: everyone may read, nobody writes
-- through the client (service role bypasses RLS for generation).
create policy "Global hit reports readable by everyone"
  on public.global_hit_reports for select
  to anon, authenticated
  using (true);

grant select on public.global_hit_reports to anon, authenticated;
