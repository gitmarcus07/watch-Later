// Supabase Edge Function: tvdb-proxy.
// @ts-nocheck — Deno runtime: checked by `supabase functions deploy`, not tsc.
//
// Server-side proxy for TheTVDB v4 API.
//
// WHY THIS EXISTS: the mobile app must never carry the TVDB API key. Every
// EXPO_PUBLIC_* value is inlined into the JS bundle at build time and is
// trivially extractable, and a TVDB key grants full API access to whoever holds
// it. This function keeps the key in a Supabase secret and forwards only an
// allowlisted set of read-only catalog endpoints, so the shipped app talks to
// Supabase and never to TVDB directly. TVDB login + token caching also move
// here, which removes all of that state from the client.
//
// Request:  POST { path, params? }
//   path   – TVDB v4 path relative to /v4, e.g. "search" or "movies/290272/extended"
//   params – optional query parameters (string | number)
//
// Response: the raw TVDB JSON body, or { error } with the upstream status.
//
// Deploy with:
//   supabase functions deploy tvdb-proxy
//   supabase secrets set TVDB_API_KEY=...
//
// ABUSE CONTROL: the anon key is public (it ships inside the app bundle), so
// this endpoint is reachable by anyone who extracts it. Three limits apply:
//   1. Supabase still requires a valid JWT (the anon key satisfies this), which
//      keeps out naive internet-wide bots.
//   2. ALLOWED below pins the surface to read-only catalog lookups — no writes,
//      no arbitrary URL fetching (so no SSRF).
//   3. A per-IP sliding window caps how fast any one caller can burn TVDB quota.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const TVDB_BASE = 'https://api4.thetvdb.com/v4';
// TVDB tokens are documented as ~1 month; refresh a day early like the old
// client did, so a revoked or expired token self-heals on the next request.
const TOKEN_TTL_MS = 29 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

// Read-only catalog routes the app actually uses. Anything else is rejected,
// which is what keeps this proxy from becoming an open relay to TVDB.
const ALLOWED: RegExp[] = [
  /^search$/,
  /^movies\/filter$/,
  /^series\/filter$/,
  /^movies\/[\w-]+\/extended$/,
  /^series\/[\w-]+\/extended$/,
  /^series\/[\w-]+\/episodes\/[\w-]+$/,
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Sliding-window limiter keyed by client IP. Best-effort only: a Deno isolate
// is ephemeral and there is no shared state across isolates, so this is a
// throttle rather than a hard quota. It is enough to stop a single extracted
// key from draining the TVDB allowance in minutes.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const buckets = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    buckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  buckets.set(ip, hits);
  // Keep the map from growing without bound on a long-lived isolate.
  if (buckets.size > 5_000) {
    for (const [key, times] of buckets) {
      if (!times.some((at) => now - at < WINDOW_MS)) buckets.delete(key);
    }
  }
  return false;
}

let cachedToken = '';
let tokenExpiresAt = 0;
let loginInFlight: Promise<string> | null = null;

async function login(apiKey: string): Promise<string> {
  const response = await fetch(`${TVDB_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apikey: apiKey }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TVDB login failed: ${response.status}`);
  const payload = await response.json();
  const token = payload?.data?.token;
  if (typeof token !== 'string' || !token) throw new Error('TVDB login returned no token.');
  cachedToken = token;
  tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  return token;
}

async function bearer(apiKey: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  // Collapse concurrent cold-start requests into one login call.
  if (!loginInFlight) {
    loginInFlight = login(apiKey).finally(() => {
      loginInFlight = null;
    });
  }
  return loginInFlight;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed. Use POST.' });

  try {
    const apiKey = Deno.env.get('TVDB_API_KEY') ?? '';
    if (!apiKey) return json(500, { error: 'Function is not configured (TVDB_API_KEY).' });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) return json(429, { error: 'Too many requests. Slow down.' });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Request body must be JSON.' });
    }

    const path = typeof body.path === 'string' ? body.path.replace(/^\/+/, '').replace(/\/+$/, '') : '';
    if (!path || !ALLOWED.some((pattern) => pattern.test(path))) {
      return json(403, { error: `Endpoint not allowed: ${path || '(empty)'}` });
    }

    const target = new URL(`${TVDB_BASE}/${path}`);
    const params = body.params;
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
        if (value === undefined || value === null) continue;
        target.searchParams.set(key, String(value));
      }
    }

    // One transparent re-login: tokens can be revoked server-side, and the app
    // should not have to care about TVDB's session lifecycle.
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await bearer(apiKey);
      lastResponse = await fetch(target.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (lastResponse.status !== 401 && lastResponse.status !== 403) break;
      cachedToken = '';
      tokenExpiresAt = 0;
    }

    if (!lastResponse) return json(502, { error: 'Upstream request failed.' });
    const text = await lastResponse.text();
    return new Response(text, {
      status: lastResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'TVDB proxy failed.';
    return json(502, { error: message });
  }
});
