#!/usr/bin/env python3
"""Weekly IMDb Top 250 snapshot into Supabase `imdb_ratings`.

Sources (all official, no scraping, no API keys except TMDB + Supabase):
- https://datasets.imdbws.com/title.basics.tsv.gz (titles, years, types)
- https://datasets.imdbws.com/title.ratings.tsv.gz (average rating + votes)
- TMDB /find/{imdb_id} (TMDB id, English title, poster, release date)

Ranking mirrors IMDb's own Top 250 formula: WR = (v/(v+m))*R + (m/(v+m))*C
with m = 25000 votes minimum and C = mean rating of titles with >=1000 votes.
Only the top CANDIDATES per list hit the TMDB API, then the top TOP_N
resolved titles are published with stable 1-based ranks.

Safety: exits nonzero (publishes nothing new) when either list resolves
fewer than MIN_ITEMS titles, so a broken upstream run keeps last week's data.
Stale rows (previous ranks no longer in the list) are deleted per list.
"""
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request

IMDB_BASE = "https://datasets.imdbws.com"
TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE = "https://image.tmdb.org/t/p/w342"

MIN_VOTES = 25000
CANDIDATES = 600
TOP_N = 250
MIN_ITEMS = 150
TMDB_SLEEP_SECONDS = 0.3
TMDB_MAX_ATTEMPTS = 5


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"missing required env var: {name}", file=sys.stderr)
        sys.exit(2)
    return value


SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")
TMDB_API_KEY = env("TMDB_API_KEY")
RUN_STARTED_AT = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def http_json(url: str, headers=None, data: bytes | None = None, method="GET", timeout=120):
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def download(url: str, label: str) -> bytes:
    last = ""
    for attempt in range(3):
        status, body = http_json(url, timeout=180)
        if status == 200:
            print(f"downloaded {label}: {len(body)} bytes")
            return body
        last = f"http {status}"
        time.sleep(5 * (attempt + 1))
    print(f"failed to download {label}: {last}", file=sys.stderr)
    sys.exit(1)


def gunzip_lines(blob: bytes):
    with gzip.open(__import__("io").BytesIO(blob), "rt", encoding="utf-8") as handle:
        for line in handle:
            yield line.rstrip("\n")


def load_ratings(blob: bytes) -> dict:
    ratings = {}
    for index, line in enumerate(gunzip_lines(blob)):
        if index == 0:
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        try:
            ratings[parts[0]] = (float(parts[1]), int(parts[2]))
        except ValueError:
            continue
    print(f"ratings rows: {len(ratings)}")
    return ratings


def candidates(blob: bytes, ratings: dict, kinds: set, want: int) -> list:
    scored = []
    for index, line in enumerate(gunzip_lines(blob)):
        if index == 0:
            continue
        parts = line.split("\t")
        if len(parts) != 9:
            continue
        tconst, title_type, primary, _original, adult, year, _end, _runtime, _genres = parts
        if title_type not in kinds or adult != "0":
            continue
        if tconst not in ratings:
            continue
        rating, votes = ratings[tconst]
        scored.append((tconst, primary, year, rating, votes))
    eligible = [row for row in scored if row[4] >= 1000]
    mean_c = sum(row[3] for row in eligible) / max(1, len(eligible))
    ranked = []
    for tconst, primary, year, rating, votes in scored:
        if votes < MIN_VOTES:
            continue
        weighted = (votes / (votes + MIN_VOTES)) * rating + (MIN_VOTES / (votes + MIN_VOTES)) * mean_c
        ranked.append((weighted, tconst, primary, year, rating, votes))
    ranked.sort(key=lambda row: -row[0])
    print(f"{sorted(kinds)[0]}-like candidates: {len(ranked)}, C={mean_c:.3f}")
    return [
        {"tconst": tconst, "primary": primary, "year": year, "rating": rating, "votes": votes}
        for _w, tconst, primary, year, rating, votes in ranked[:want]
    ]


def tmdb_find(tconst: str, kind: str):
    url = f"{TMDB_BASE}/find/{tconst}?api_key={TMDB_API_KEY}&external_source=imdb_id"
    for attempt in range(TMDB_MAX_ATTEMPTS):
        status, body = http_json(url, timeout=30)
        if status == 200:
            try:
                payload = json.loads(body.decode("utf-8"))
            except ValueError:
                return None
            results = payload.get("movie_results" if kind == "movie" else "tv_results") or []
            return results[0] if results else None
        if status == 429:
            time.sleep(10 * (attempt + 1))
            continue
        if status is not None and 500 <= status < 600:
            time.sleep(5 * (attempt + 1))
            continue
        return None
    return None


def resolve(cands: list, kind: str) -> list:
    resolved = []
    for cand in cands:
        match = tmdb_find(cand["tconst"], kind)
        time.sleep(TMDB_SLEEP_SECONDS)
        if not match:
            continue
        title = (match.get("title") or match.get("name") or cand["primary"] or "").strip()
        date = match.get("release_date") or match.get("first_air_date") or ""
        year = None
        if isinstance(date, str) and len(date) >= 4 and date[:4].isdigit():
            year = int(date[:4])
        elif cand["year"] and cand["year"].isdigit():
            year = int(cand["year"])
        poster = match.get("poster_path")
        resolved.append(
            {
                "tmdb_id": match.get("id"),
                "media_type": kind,
                "imdb_id": cand["tconst"],
                "title": title,
                "year": year,
                "poster_url": f"{TMDB_IMAGE}{poster}" if poster else None,
                "rating": round(cand["rating"], 1),
                "votes": cand["votes"],
            }
        )
        if len(resolved) >= TOP_N:
            break
    for index, row in enumerate(resolved):
        row["list_rank"] = index + 1
        row["updated_at"] = RUN_STARTED_AT
    print(f"resolved {kind}: {len(resolved)}")
    return resolved


def rest(path: str, method="GET", payload=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    if method == "POST":
        headers["Prefer"] = "resolution=merge-duplicates"
    status, body = http_json(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, data=data, method=method)
    return status, body


def publish(rows: list, kind: str) -> None:
    for start in range(0, len(rows), 200):
        chunk = rows[start : start + 200]
        status, body = rest("imdb_ratings?on_conflict=tmdb_id,media_type", method="POST", payload=chunk)
        if status not in (200, 201):
            print(f"upsert failed ({kind}): http {status} {body[:200]!r}", file=sys.stderr)
            sys.exit(1)
    status, body = rest(
        f"imdb_ratings?media_type=eq.{kind}&updated_at=lt.{RUN_STARTED_AT}", method="DELETE"
    )
    if status not in (200, 204):
        print(f"stale cleanup failed ({kind}): http {status} {body[:200]!r}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    basics = download(f"{IMDB_BASE}/title.basics.tsv.gz", "title.basics")
    ratings_blob = download(f"{IMDB_BASE}/title.ratings.tsv.gz", "title.ratings")
    ratings = load_ratings(ratings_blob)
    movie_cands = candidates(basics, ratings, {"movie"}, CANDIDATES)
    series_cands = candidates(basics, ratings, {"tvSeries", "tvMiniSeries"}, CANDIDATES)
    movies = resolve(movie_cands, "movie")
    series = resolve(series_cands, "series")
    if len(movies) < MIN_ITEMS or len(series) < MIN_ITEMS:
        print(f"refusing to publish partial lists: movies={len(movies)} series={len(series)}", file=sys.stderr)
        sys.exit(1)
    publish(movies, "movie")
    publish(series, "series")
    print(f"published movies={len(movies)} series={len(series)}")


if __name__ == "__main__":
    main()
