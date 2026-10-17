/**
 * Audits catalog.generated.ts against the seed: for every seed item, finds the
 * best-matching generated entry (title similarity + year) and reports poor
 * matches or missing items.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './franchise-seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = readFileSync(path.join(root, 'src', 'data', 'remote', 'franchises', 'catalog.generated.ts'), 'utf8');

function norm(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
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

// Parse the generated file into { title, items: [{mediaType, providerId, title, year}] }.
const franchises = [];
const blocks = source.split(/\n  \{\n/).slice(1);
for (const block of blocks) {
  const franchiseTitle = JSON.parse(/title: ("(?:[^"\\]|\\.)*")/.exec(block)?.[1] ?? '""');
  const items = [...block.matchAll(/mediaType: '(\w+)', providerId: '(\d+)', title: ("(?:[^"\\]|\\.)*"), year: (\d+|undefined), releaseDate: ("(?:[^"\\]|\\.)*"|undefined)/g)].map((m) => ({
    mediaType: m[1],
    providerId: m[2],
    title: JSON.parse(m[3]),
    year: m[4] === 'undefined' ? undefined : Number(m[4]),
    releaseDate: m[5] === 'undefined' ? undefined : JSON.parse(m[5]),
  }));
  franchises.push({ title: franchiseTitle, items });
}

// Every franchise must be stored in ascending release-date order, and every
// member must carry a date (the build sorts by full date, so this guards the
// generated file itself).
for (const franchise of franchises) {
  const dates = franchise.items.map((item) => item.releaseDate);
  const missing = dates.filter((date) => !date).length;
  if (missing) console.log(`NO-DATE ${missing} item(s) [${franchise.title}]`);
  const known = dates.filter(Boolean);
  const sorted = [...known].sort();
  if (JSON.stringify(known) !== JSON.stringify(sorted)) {
    console.log(`OUT-OF-ORDER [${franchise.title}]\n    ${dates.join(' | ')}`);
  }
}

let flags = 0;
for (const seedEntry of SEED) {
  const generated = franchises.find((entry) => entry.title === seedEntry.title);
  if (!generated) {
    console.log(`NO FRANCHISE [${seedEntry.title}]`);
    flags += 1;
    continue;
  }
  for (const raw of seedEntry.items) {
    const kind = raw.startsWith('tv:') ? 'series' : 'movie';
    let seedTitle = raw.replace(/^tv:/, '').replace(/^tmdb:\d+\s+/, '');
    let seedYear;
    const match = /^(.*)\s\((\d{4})\)$/.exec(seedTitle);
    if (match) {
      seedTitle = match[1];
      seedYear = Number(match[2]);
    }
    const candidates = generated.items.filter((item) => item.mediaType === kind);
    if (!candidates.length) {
      console.log(`MISSING  [${seedEntry.title}] ${seedTitle} (${seedYear ?? '?'}) — no ${kind}`);
      flags += 1;
      continue;
    }
    const scored = candidates.map((item) => {
      const sim = similarity(norm(item.title), norm(seedTitle));
      const yearDelta = seedYear && item.year !== undefined ? Math.abs(item.year - seedYear) : undefined;
      return { item, sim, yearDelta, score: sim + (yearDelta !== undefined && yearDelta <= 1 ? 0.6 : 0) };
    });
    const best = scored.sort((a, b) => b.score - a.score)[0];
    const nearYear = seedYear ? scored.filter((entry) => entry.yearDelta !== undefined && entry.yearDelta <= 1) : [];
    const verdict = [];
    if (best.sim < 0.6 && !nearYear.length) verdict.push('sim');
    if (seedYear && best.item.year !== undefined && Math.abs(best.item.year - seedYear) > 1 && best.sim < 0.85) verdict.push('year');
    if (verdict.length) {
      const list = scored.slice(0, 3).map((entry) => `${entry.item.title} (${entry.item.year ?? '?'}) sim=${entry.sim.toFixed(2)}`);
      console.log(`FLAG(${verdict.join(',')})  [${seedEntry.title}] seed="${seedTitle} (${seedYear ?? '?'})" best="${best.item.title} (${best.item.year ?? '?'})" id=${best.item.providerId}\n         top: ${list.join(' | ')}`);
      flags += 1;
    }
  }
}
console.log(flags ? `\n${flags} flags` : '\nclean');
