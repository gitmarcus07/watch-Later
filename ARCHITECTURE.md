# Architecture

## Project structure and flow

Expo Router owns route composition under `app/`. Route components compose reusable controls from `src/components/` and call feature-level services; data access stays in repositories and data sources. Feature logic lives in `src/features/`, domain contracts and models in `src/domain/`, and implementations in `src/data/`.

The intended dependency direction is UI → feature/use case → domain contract → repository/data source. UI components do not issue SQL or call Supabase directly.

## State ownership

- Zustand contains client state only: session mode, onboarding completion, and future UI preferences.
- AsyncStorage persists the small session/onboarding envelope. Guest content belongs in SQLite, never Zustand.
- TanStack Query is configured for remote/server state and is not used as a local user-data database.
- Expo SQLite is the source of truth for future guest-owned watch data.

## Local database

`getDatabase()` opens one lazily initialized `watch-later.db` connection, enables foreign keys and WAL, and runs exclusive, versioned migrations. Migration history is recorded in `schema_migrations`, and schema version is reflected by SQLite `user_version`. The initial schema establishes app metadata, content references, user-owned content state, and sync metadata. Additional episode, list, rating, favorite, and history tables belong in subsequent migrations.

`SqliteDatabaseRepository` is the first repository adapter. Future feature repositories should own DAOs/queries and implement domain-facing contracts. Transactions belong at the database/data layer.

## Guest and account ownership

Session is a discriminated union: `unauthenticated`, `guest`, or `authenticated`. Guest entry requires no account and survives app restarts. A stable per-install guest owner ID can scope local content rows. Guest content must be retained when account creation begins.

`GuestMigrationService` marks the boundary for a future migration: prepare/export, upload/associate, conflict resolution, and completion metadata. Its current implementation is explicitly a stub; no local data is deleted or uploaded automatically.

## Supabase and future TMDb

Supabase is initialized in `src/data/remote/supabase/client.ts` only when public URL and anon key are configured. Session persistence uses AsyncStorage; the service-role key must never ship in the client. RLS and cloud synchronization are later work.

The TMDb boundary is reserved under `src/data/remote/tmdb/` when implemented. API calls and caching should be owned by repositories/query functions. The public TMDb key variable is only an example; no TMDb request is made in Phase 1.

## Navigation

The route tree has welcome, login, and create-account paths plus five bottom tabs: Home, Search, Watchlist, Watched, and More. Route names are URL/deep-link friendly; modal presentation is used for auth placeholders. Expo Router handles native back behavior and preserves tab stacks.

## Design system

All semantic colors, typography, spacing, radius, and shadows live under `src/theme/`. The UI uses a dark cinematic base, lavender accent, restrained gradients, rounded surfaces, and Expo vector icons.
