-- Watch-later priority (ASAP / Weekend / Someday). Nullable so existing rows
-- stay valid; free text would also work but the app only writes the three values.

alter table public.watchlist_entries
  add column if not exists priority text;

create index if not exists watchlist_entries_priority_idx on public.watchlist_entries(user_id, priority);
