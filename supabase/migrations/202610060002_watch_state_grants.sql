-- Additive fix for Postgres 42501 table privileges.
-- RLS policies already exist in 202610060001_watch_state.sql.
-- No access is granted to anon/public.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.library_media to authenticated;
grant select, insert, update, delete on public.watchlist_entries to authenticated;
grant select, insert, update, delete on public.movie_watches to authenticated;
grant select, insert, update, delete on public.tracked_series to authenticated;
grant select, insert, update, delete on public.episode_watches to authenticated;
