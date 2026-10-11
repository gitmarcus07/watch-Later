-- Explicit whole-series completion so anime (no per-episode metadata) can be
-- marked watched. Episode-derived completion keeps working unchanged.

alter table public.tracked_series
  add column if not exists completed boolean not null default false,
  add column if not exists completed_at timestamptz;

create index if not exists tracked_series_completed_idx on public.tracked_series(user_id, completed);
