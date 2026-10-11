// Supabase Edge Function: generate-global-hits.
// @ts-nocheck — Deno runtime: checked by `supabase functions deploy`, not tsc.
//
// Builds persistent Global Hits reports from TMDB Discover, ranked by TMDB
// popularity among exact calendar-period releases (methodology
// `tmdb-popularity-v1`). Mirrors the app rules in
// src/features/hits/{period,ranking}.ts — keep them in sync.
//
// Trigger: daily cron (e.g. `5 0 * * *`) with no body. The function derives
// what is due (last completed month; plus last year in January) and no-ops
// when everything is published, so duplicate/overlapping runs are safe.
// Manual call: POST { periodType, periodKey, dryRun?, adminKey? }.
// Auth: `x-hits-admin-key` header (or body.adminKey) must equal the
// HITS_ADMIN_KEY secret. TMDB key comes from the TMDB_API_KEY secret — the
// mobile app never sees either value.
//
// Deploy with:
//   supabase functions deploy generate-global-hits
//   supabase secrets set TMDB_API_KEY=... HITS_ADMIN_KEY=...
// Cron (dashboard → Functions → generate-global-hits → Triggers, or pg_cron
// + pg_net calling the function URL with the admin header) runs it daily.
// December 31 intentionally publishes nothing: the year is still in progress
// until midnight, so the final yearly report generates on January 1 instead.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const METHODOLOGY = 'tmdb-popularity-v1';
const TOP_N = 20;
const MAX_PAGES = 5;
const MIN_YEAR = 1970;
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w342';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hits-admin-key',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

interface Period {
  type: 'month' | 'year';
  key: string;
  from: string;
  to: string;
}

function parsePeriod(type: string, key: string, now: Date): Period | null {
  const maxYear = now.getUTCFullYear();
  const today = `${maxYear}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  if (type === 'month') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < MIN_YEAR || year > maxYear) return null;
    const from = `${year}-${pad2(month)}-01`;
    if (from > today) return null;
    return { type, key, from, to: `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}` };
  }
  if (type === 'year') {
    if (!/^(\d{4})$/.exec(key)) return null;
    const year = Number(key);
    if (year < MIN_YEAR || year > maxYear) return null;
    const from = `${year}-01-01`;
    if (from > today) return null;
    return { type, key, from, to: `${year}-12-31` };
  }
  return null;
}

function lastCompletedMonth(now: Date): string {
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const lastMonth = new Date(firstOfThisMonth - 1);
  return `${lastMonth.getUTCFullYear()}-${pad2(lastMonth.getUTCMonth() + 1)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tmdbGet(path: string, params: Record<string, string | number>, apiKey: string): Promise<Record<string, unknown>> {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('api_key', apiKey);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url.toString());
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    lastError = `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200);
    // Retry rate limits and transient server failures, then give up loudly
    // so nothing is published from a partial fetch.
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      await sleep(750 * 2 ** attempt);
      continue;
    }
    throw new Error(`TMDB request failed: ${lastError}`);
  }
  throw new Error(`TMDB request failed after retries: ${lastError}`);
}

interface RawItem {
  rank: number;
  tmdbId: number;
  mediaType: 'movie' | 'series';
  title: string;
  posterPath?: string;
  releaseDate: string;
  popularity: number | null;
  voteAverage: number | null;
  voteCount: number | null;
}

async function buildCategory(
  kind: 'movie' | 'series',
  period: Period,
  apiKey: string,
): Promise<{ items: RawItem[]; retrievedAt: string }> {
  const isMovie = kind === 'movie';
  const path = isMovie ? 'discover/movie' : 'discover/tv';
  const dateField = isMovie ? 'release_date' : 'first_air_date';
  const collected: RawItem[] = [];
  let retrievedAt = new Date().toISOString();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params: Record<string, string | number> = {
      page,
      sort_by: 'popularity.desc',
      include_adult: 'false',
      ...(isMovie
        ? { 'primary_release_date.gte': period.from, 'primary_release_date.lte': period.to }
        : {
          'first_air_date.gte': period.from,
          'first_air_date.lte': period.to,
          include_null_first_air_dates: 'false',
        }),
    };
    const body = await tmdbGet(path, params, apiKey);
    retrievedAt = new Date().toISOString();
    const results = Array.isArray(body.results) ? body.results as Record<string, unknown>[] : [];
    for (const row of results) {
      const date = isMovie ? row.release_date : row.first_air_date;
      if (!isValidCalendarDate(date) || date < period.from || date > period.to) continue;
      const tmdbId = typeof row.id === 'number' ? row.id : 0;
      const title = (isMovie ? row.title : row.name) as string | undefined;
      if (!tmdbId || !title) continue;
      collected.push({
        rank: 0,
        tmdbId,
        mediaType: kind,
        title,
        posterPath: typeof row.poster_path === 'string' ? `${TMDB_IMAGE}${row.poster_path}` : undefined,
        releaseDate: date,
        popularity: typeof row.popularity === 'number' ? row.popularity : null,
        voteAverage: typeof row.vote_average === 'number' ? row.vote_average : null,
        voteCount: typeof row.vote_count === 'number' ? row.vote_count : null,
      });
    }
    const totalPages = typeof body.total_pages === 'number' ? body.total_pages : page;
    if (page >= totalPages || results.length === 0) break;
  }
  collected.sort((a, b) => (b.popularity ?? Number.NEGATIVE_INFINITY) - (a.popularity ?? Number.NEGATIVE_INFINITY));
  const ranked = collected.slice(0, TOP_N);
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });
  return { items: ranked, retrievedAt };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const adminKey = Deno.env.get('HITS_ADMIN_KEY') ?? '';
    const tmdbKey = Deno.env.get('TMDB_API_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!adminKey || !tmdbKey || !supabaseUrl || !serviceKey) {
      return json(500, { error: 'Function is not configured (HITS_ADMIN_KEY, TMDB_API_KEY, service role).' });
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const presented = req.headers.get('x-hits-admin-key') ?? (typeof body.adminKey === 'string' ? body.adminKey : '');
    if (presented !== adminKey) return json(401, { error: 'Missing or invalid admin key.' });

    const now = new Date();
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: existing } = await admin.from('global_hit_reports').select('period_type,period_key').eq('status', 'published');
    const published = new Set((existing ?? []).map((row) => `${(row as Record<string, string>).period_type}:${(row as Record<string, string>).period_key}`));

    const dryRun = body.dryRun === true;
    let targets: { type: 'month' | 'year'; key: string }[] = [];
    if (typeof body.periodType === 'string' && typeof body.periodKey === 'string') {
      const parsed = parsePeriod(body.periodType, body.periodKey, now);
      if (!parsed) return json(400, { error: 'Invalid period. Use month YYYY-MM (1970+, not future) or year YYYY.' });
      targets = [{ type: parsed.type, key: parsed.key }];
    } else {
      const monthKey = lastCompletedMonth(now);
      if (!published.has(`month:${monthKey}`)) targets.push({ type: 'month', key: monthKey });
      if (now.getUTCMonth() === 0) {
        const yearKey = String(now.getUTCFullYear() - 1);
        if (!published.has(`year:${yearKey}`)) targets.push({ type: 'year', key: yearKey });
      }
      if (!targets.length) return json(200, { published: false, reason: 'up-to-date' });
    }

    const results: Record<string, unknown>[] = [];
    for (const target of targets) {
      const period = parsePeriod(target.type, target.key, now);
      if (!period) {
        results.push({ ...target, published: false, reason: 'invalid-period' });
        continue;
      }
      const generatedAt = new Date().toISOString();
      const movies = await buildCategory('movie', period, tmdbKey);
      const series = await buildCategory('series', period, tmdbKey);
      const retrievedAt = movies.retrievedAt > series.retrievedAt ? movies.retrievedAt : series.retrievedAt;
      const payload = {
        period_type: period.type,
        period_key: period.key,
        generated_at: generatedAt,
        retrieved_at: retrievedAt,
        methodology: METHODOLOGY,
        status: 'published',
        movie_items: movies.items,
        series_items: series.items,
      };
      if (!movies.items.length && !series.items.length) {
        results.push({ ...target, published: false, reason: 'empty refusing to publish' });
        continue;
      }
      if (dryRun) {
        results.push({ ...target, published: false, dryRun: true, movies: movies.items.length, series: series.items.length, sample: movies.items[0] ?? series.items[0] ?? null });
        continue;
      }
      // Immutability: a published row is never rewritten.
      const { data: current } = await admin
        .from('global_hit_reports')
        .select('period_type,period_key,generated_at,retrieved_at,methodology,status,movie_items,series_items')
        .eq('period_type', period.type)
        .eq('period_key', period.key)
        .maybeSingle();
      if (current) {
        results.push({ ...target, published: false, reason: 'already-published' });
        continue;
      }
      const { error: insertError } = await admin.from('global_hit_reports').insert(payload);
      if (insertError) {
        // Lost a race with another run: re-read instead of overwriting. A
        // genuine failure publishes nothing.
        const { data: raced } = await admin
          .from('global_hit_reports')
          .select('period_type,period_key')
          .eq('period_type', period.type)
          .eq('period_key', period.key)
          .maybeSingle();
        results.push({ ...target, published: false, reason: raced ? 'already-published' : `insert failed: ${insertError.message}` });
        continue;
      }
      results.push({ ...target, published: true, movies: movies.items.length, series: series.items.length });
    }
    return json(200, { published: results.some((result) => (result as Record<string, unknown>).published === true), results });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Generation failed.';
    return json(500, { error: message });
  }
});
