-- Manual watchlist ordering. Position sorts ascending; lower appears first.
-- Updated alongside the row's updated_at so last-writer-wins still applies.

alter table public.watchlist_entries add column if not exists position integer not null default 0;
