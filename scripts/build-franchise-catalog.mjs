/**
 * Resolves scripts/franchise-seed.mjs against the TMDb API and writes
 * src/data/remote/franchises/catalog.generated.ts.
 *
 * Usage: node scripts/build-franchise-catalog.mjs
 * Reads EXPO_PUBLIC_TMDB_API_KEY / EXPO_PUBLIC_TMDB_BASE from .env.
 * Reports every item it could not match so the seed can be fixed.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './franchise-seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outFile = path.join(root, 'src', 'data', 'remote', 'franchises', 'catalog.generated.ts');

const envText = readFileSync(path.join(root, '.env'), 'utf8');
const apiKey = /EXPO_PUBLIC_TMDB_API_KEY\s*=\s*(.+)/.exec(envText)?.[1]?.trim();
const base = (/EXPO_PUBLIC_TMDB_BASE\s*=\s*(.+)/.exec(envText)?.[1]?.trim() ?? 'https://api.themoviedb.org/3').replace(/\/$/, '');
if (!apiKey) {
  console.error('EXPO_PUBLIC_TMDB_API_KEY missing from .env');
  process.exit(1);
}

/** Case/punctuation-insensitive key, mirroring src searchRank.normalizeSearchText. */
function norm(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    const cur = [i];
    for (let j = 1; j < cols; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[cols - 1];
}

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function parseItem(raw) {
  const kind = raw.startsWith('tv:') ? 'series' : 'movie';
  let title = raw.replace(/^tv:/, '');
  let year;
  const match = /^(.*)\s\((\d{4})\)$/.exec(title);
  if (match) {
    title = match[1];
    year = Number(match[2]);
  }
  return { kind, title, year };
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function api(pathname, params, attempt = 0) {
  const url = new URL(`${base}/${pathname}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set('api_key', apiKey);
  let response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (error) {
    if (attempt >= 5) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    return api(pathname, params, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    return api(pathname, params, attempt + 1);
  }
  if (!response.ok) throw new Error(`${pathname} -> HTTP ${response.status}`);
  return response.json();
}

async function resolveItem(raw) {
  const { kind, title, year } = parseItem(raw);
  const endpoint = kind === 'series' ? 'search/tv' : 'search/movie';
  const data = await api(endpoint, { query: title, include_adult: 'false' });
  const results = Array.isArray(data.results) ? data.results : [];
  const target = norm(title);
  let best = null;
  for (const result of results) {
    const name = result.title ?? result.name ?? '';
    const date = result.release_date ?? result.first_air_date ?? '';
    const resultYear = date ? Number(date.slice(0, 4)) : undefined;
    const candidate = norm(name);
    let score = -100;
    if (candidate === target) score = 100;
    else if (candidate.includes(target) || target.includes(candidate)) score = 60;
    else if (similarity(candidate, target) >= 0.75) score = 40;
    if (score <= 0) continue;
    if (year && resultYear) score += 20 - Math.min(Math.abs(year - resultYear), 12) * 4;
    else if (year && !resultYear) score -= 15;
    score += Math.min(Math.log10((result.popularity ?? 0) + 1) * 4, 8);
    if (!best || score > best.score) best = { result, score, name, resultYear };
  }
  if (!best || best.score < 40) return { ok: false, title, year, kind };
  const { result, name } = best;
  const date = result.release_date ?? result.first_air_date ?? '';
  return {
    ok: true,
    item: {
      provider: 'tmdb',
      mediaType: kind,
      providerId: String(result.id),
      title: name,
      year: date ? Number(date.slice(0, 4)) : undefined,
      releaseDate: date || undefined,
      posterPath: result.poster_path ?? null,
      backdropPath: result.backdrop_path ?? null,
    },
  };
}

async function pool(jobs, size, worker) {
  const results = new Array(jobs.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(jobs[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const franchises = [];
const unresolved = [];

for (const entry of SEED) {
  const slug = slugify(entry.title);
  const items = await pool(entry.items, 6, async (raw) => {
    try {
      const outcome = await resolveItem(raw);
      if (!outcome.ok) unresolved.push({ franchise: entry.title, raw, ...outcome });
      return outcome.ok ? outcome.item : null;
    } catch (error) {
      unresolved.push({ franchise: entry.title, raw, reason: String(error?.message ?? error) });
      return null;
    }
  });
  const kept = items.filter(Boolean);
  // Canonical franchise order: by full release/air date, seed order breaks ties.
  kept.sort((a, b) => {
    const da = a.releaseDate ?? '';
    const db = b.releaseDate ?? '';
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });
  if (!kept.length) {
    console.warn(`!! dropped "${entry.title}" — nothing resolved`);
    continue;
  }
  const backdrop = kept.map((item) => item.backdropPath).find(Boolean) ?? null;
  franchises.push({
    slug,
    title: entry.title,
    overview: entry.overview,
    backdropPath: backdrop,
    items: kept.map(({ backdropPath: _backdrop, ...item }) => item),
  });
}

franchises.sort((a, b) => a.title.localeCompare(b.title));
const totalItems = franchises.reduce((sum, entry) => sum + entry.items.length, 0);

const lines = franchises.map((entry) => {
  const items = entry.items
    .map(
      (item) =>
        `      { provider: '${item.provider}', mediaType: '${item.mediaType}', providerId: '${item.providerId}', title: ${JSON.stringify(item.title)}, year: ${item.year ?? 'undefined'}, releaseDate: ${JSON.stringify(item.releaseDate)}, posterPath: ${JSON.stringify(item.posterPath)} }`,
    )
    .join(',\n');
  return `  {\n    slug: ${JSON.stringify(entry.slug)},\n    title: ${JSON.stringify(entry.title)},\n    overview: ${JSON.stringify(entry.overview)},\n    backdropPath: ${JSON.stringify(entry.backdropPath)},\n    items: [\n${items},\n    ],\n  },`;
});

const output = `// AUTO-GENERATED by scripts/build-franchise-catalog.mjs — edit scripts/franchise-seed.mjs instead.
import type { FranchiseCollection } from '@/domain/models/franchise';

export const FRANCHISES: FranchiseCollection[] = [
${lines.join('\n')}
];
`;

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, output, 'utf8');

console.log(`\n${franchises.length} franchises, ${totalItems} items -> ${path.relative(root, outFile)}`);
if (unresolved.length) {
  console.log(`\n${unresolved.length} unresolved:`);
  for (const item of unresolved) console.log(`  [${item.franchise}] ${item.raw}${item.reason ? ` (${item.reason})` : ''}`);
}
