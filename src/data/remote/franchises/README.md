# Franchise collections

`catalog.generated.ts` is produced by `node scripts/build-franchise-catalog.mjs`
from the hand-curated seed in `scripts/franchise-seed.mjs`. Do not edit the
generated file by hand — edit the seed and re-run the script (needs the
`EXPO_PUBLIC_TMDB_API_KEY` from `.env`; it resolves every title against TMDb and
prints anything it could not match so it can be fixed).
