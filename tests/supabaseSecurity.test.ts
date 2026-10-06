import { readFileSync } from 'node:fs';

describe('Supabase watch-state security migration', () => {
  const sql = readFileSync('supabase/migrations/202610060001_watch_state.sql', 'utf8').toLowerCase();
  const tables = ['profiles', 'library_media', 'watchlist_entries', 'movie_watches', 'tracked_series', 'episode_watches'];

  it.each(tables)('enables RLS and owner-scoped read/write policies for %s', (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toMatch(new RegExp(`create policy ".*" on public\\.${table} for select to authenticated using \\((?:id|user_id) = \\(select auth\\.uid\\(\\)\\)\\)`));
    expect(sql).toMatch(new RegExp(`create policy ".*" on public\\.${table} for insert to authenticated with check \\((?:id|user_id) = \\(select auth\\.uid\\(\\)\\)\\)`));
    expect(sql).toMatch(new RegExp(`create policy ".*" on public\\.${table} for update to authenticated using \\((?:id|user_id) = \\(select auth\\.uid\\(\\)\\)\\) with check \\((?:id|user_id) = \\(select auth\\.uid\\(\\)\\)\\)`));
    expect(sql).toMatch(new RegExp(`create policy ".*" on public\\.${table} for delete to authenticated using \\((?:id|user_id) = \\(select auth\\.uid\\(\\)\\)\\)`));
  });

  it('uses normalized provider-qualified entities and explicit tombstones', () => {
    expect(sql).toContain('primary key (user_id, provider, media_type, provider_id)');
    expect(sql).toContain('primary key (user_id, episode_provider_id)');
    expect(sql).toContain('is_deleted boolean not null default false');
    expect(sql).toContain('foreign key (user_id, provider, media_type, provider_id) references public.library_media');
    expect(sql).not.toContain('using (true)');
    expect(sql).not.toContain('with check (true)');
  });
});
