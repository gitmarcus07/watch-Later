/**
 * Seed ONE clearly-labeled DEMO OTT record so you can see the feature work
 * end to end, then delete it before production use.
 *
 * It never invents an exact day: the demo uses status `expected` with a
 * month window (next month), which also demonstrates that month windows
 * render as "Nov 2026" and never schedule a notification.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<paste from Supabase Dashboard > Project Settings > API>"
 *   node scripts/seed-ott.mjs
 *   node scripts/seed-ott.mjs --search "Jawan" --platform "Netflix"
 *   node scripts/seed-ott.mjs --notify-test   # exact date TOMORROW for alert testing
 *
 * The service-role key is read from the environment only and is never
 * written to any file. Delete the demo row when finished (the script
 * prints the exact SQL for that).
 */
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

/** Retries transient network drops (ECONNRESET etc.) before giving up. */
async function fetchWithRetry(url, options, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < tries) {
        const waitMs = 1500 * attempt;
        console.log(`Network hiccup (attempt ${attempt}/${tries}), retrying in ${waitMs / 1000}s…`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError;
}

async function main() {
  const env = loadEnv('.env');
  const SUPABASE_URL = (env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const TMDB_BASE = (env.EXPO_PUBLIC_TMDB_BASE ?? 'https://api.themoviedb.org/3').replace(/\/$/, '');
  const TMDB_KEY = env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const SEARCH = arg('search', 'Jawan');
  const PLATFORM = arg('platform', 'Netflix');

  if (!SUPABASE_URL) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL in .env');
    return 1;
  }
  if (!SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY first:');
    console.error('  PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"');
    console.error('Find it in Supabase Dashboard > Project Settings > API (service_role, secret).');
    return 1;
  }

  // 1. Table must exist (migration applied) and be granted.
  const probe = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ott_releases?select=id&limit=1`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (probe.status === 404) {
    console.error('Table public.ott_releases does not exist yet.');
    console.error('Apply supabase/migrations/202610100001_ott_releases.sql first:');
    console.error('  Supabase Dashboard > SQL Editor > paste the file > Run, then re-run this script.');
    return 1;
  }
  if (probe.status === 403) {
    console.error('Permission denied for public.ott_releases (HTTP 403).');
    console.error('Run these two lines in Supabase Dashboard > SQL Editor, then re-run this script:');
    console.error('  grant select on public.ott_releases to anon, authenticated;');
    console.error('  grant select, insert, update, delete on public.ott_releases to service_role;');
    return 1;
  }
  if (!probe.ok) {
    console.error(`Supabase probe failed: HTTP ${probe.status} ${(await probe.text()).slice(0, 200)}`);
    return 1;
  }

  // 2. Resolve a REAL TMDB movie so the detail screen can load it.
  let movie = null;
  if (TMDB_KEY) {
    const res = await fetchWithRetry(`${TMDB_BASE}/search/movie?api_key=${encodeURIComponent(TMDB_KEY)}&query=${encodeURIComponent(SEARCH)}&include_adult=false`);
    if (res.ok) {
      const data = await res.json();
      movie = (data.results ?? [])[0] ?? null;
    }
  }
  if (!movie) {
    console.error(`TMDB search found nothing for "${SEARCH}". Try --search "Some Other Title".`);
    return 1;
  }
  console.log(`Resolved movie: ${movie.title} (${(movie.release_date ?? '').slice(0, 4)}) [tmdb id ${movie.id}]`);

  // 3. Insert the DEMO record. Default: month window (never a fabricated
  // exact day). --notify-test: exact date TOMORROW so the Notify-me alert
  // can be tested end to end. Both are DEMO-labeled and deleted after.
  const notifyTest = process.argv.includes('--notify-test');
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const windowMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const slug = PLATFORM.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `ott:tmdb:movie:${movie.id}:${slug}:IN:premiere`;
  const record = {
    id,
    provider: 'tmdb',
    media_type: 'movie',
    provider_id: String(movie.id),
    movie_title: `DEMO — ${movie.title}`,
    platform: PLATFORM,
    platform_logo_url: null,
    tmdb_provider_id: null,
    country: 'IN',
    theatrical_date: movie.release_date || null,
    ott_date: notifyTest ? tomorrowIso : windowMonth,
    date_precision: notifyTest ? 'exact' : 'month',
    status: 'expected',
    source_url: `https://www.themoviedb.org/movie/${movie.id}`,
    source_published_at: null,
    last_verified_at: new Date().toISOString(),
    notes: notifyTest
      ? 'DEMO DATA for notification testing — delete before production use.'
      : 'DEMO DATA — delete before production use.',
    is_premiere: true,
  };

  const insert = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ott_releases`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(record),
  });
  if (!insert.ok) {
    console.error(`Insert failed: HTTP ${insert.status} ${(await insert.text()).slice(0, 500)}`);
    return 1;
  }

  console.log('\nDemo record inserted. Open it in the app:');
  console.log(`  Upcoming on OTT screen, or search "${movie.title}" > open details > OTT Release section.`);
  if (notifyTest) {
    console.log('\nNotification test: open its OTT Release section, toggle Notify me ON,');
    console.log('then check Settings > Notifications > Send test notification for the instant check.');
    console.log('The premiere alert itself is scheduled for tomorrow 9:00am local time.');
  }
  console.log('\nDelete it when finished (Supabase Dashboard > SQL Editor):');
  console.log(`  delete from public.ott_releases where id = '${id}';`);
  return 0;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/seed-ott.mjs [--search "Movie Title"] [--platform "Netflix"] [--notify-test]');
  console.log('  --notify-test inserts an exact date TOMORROW (status expected) to test premiere alerts.');
} else {
  // Awaited at top level: the process exits naturally so open sockets drain
  // instead of crashing (Windows libuv assertion on abrupt exit).
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`Network error: ${error?.cause?.message ?? error?.message ?? error}`);
    console.error('The connection dropped — just re-run the script.');
    process.exitCode = 1;
  }
}
