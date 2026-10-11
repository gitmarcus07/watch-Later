-- Unranked rows: the weekly pipeline also snapshots recent releases (IMDb
-- scores for fresh titles), which carry no Top 250 rank. Ranked rows keep
-- list_rank 1..250; queries must filter nulls (they sort first otherwise).
alter table public.imdb_ratings alter column list_rank drop not null;
