# Architecture

## Project structure and flow

Expo Router owns route composition under `app/`. Route components compose reusable controls from `src/components/` and call feature-level services; data access stays in repositories and data sources. Feature logic lives in `src/features/`, domain contracts and models in `src/domain/`, and implementations in `src/data/`.

The intended dependency direction is UI → feature/use case → domain contract → repository/data source. UI components do not issue SQL or call Supabase directly.

## State ownership

- Zustand contains client state only: session mode, onboarding completion, and future UI preferences.
- AsyncStorage persists the small session/onboarding envelope. Guest content belongs in SQLite, never Zustand.
- TanStack Query owns remote catalog/server state and is not used as a local user-data database.
- Expo SQLite is the runtime source of truth for watch state for guests and authenticated users.
- The SQLite outbox records pending watch-state mutations and tombstones. Supabase availability never gates a local mutation.

## Local database

`getDatabase()` opens one lazily initialized `watch-later.db` connection, enables foreign keys and WAL, and runs exclusive, versioned migrations. Migration history is recorded in `schema_migrations`, and schema version is reflected by SQLite `user_version`. Migration v4 adds a durable sync outbox and single-account device binding without replacing the Phase 4 watch-state tables.

`SqliteDatabaseRepository` initializes the database and `SqliteWatchStateRepository` owns watch-state and sync operations. Transactions belong at the database/data layer.

## Guest and account ownership

Session is a discriminated union: `unauthenticated`, `guest`, or `authenticated`. Guest entry requires no account and survives app restarts. Supabase Auth owns authenticated token persistence in AsyncStorage; the app session store contains only mode, user ID, and email. Auth restoration does not gate the local library after normal startup hydration.

On sign-in or account creation, the local repository binds SQLite state to that Supabase user and queues its current watchlist, movie watches, tracked series, and watched episodes. The sync service fetches that user's cloud records, merges by provider-qualified entity key and UTC `updated_at`, applies remote-only/newer records in a SQLite transaction, and uploads local-only/newer records. Equal timestamps deterministically favor the local mutation. Cloud removals and unwatches are tombstones. Remote-applied rows bypass the outbox to prevent loops. Failed uploads remain queued for retry.

For safety, the local database records the first account that syncs on a device. Sign-in to a different account on that device is refused; this prevents retained local data from one account from leaking into another. Sign-out clears only the Supabase session and returns to guest mode; it does not delete SQLite data or pending work.

## Supabase and remote media catalog

Supabase is initialized in `src/data/remote/supabase/client.ts` only when the public URL and anon key are configured. `SupabaseAuthService` handles email/password sign-up, sign-in, and sign-out. `SupabaseWatchStateRepository` is the cloud adapter; `SyncService` owns merge and retry orchestration. The cloud migration creates user-owned media metadata, watchlist entries, movie watches, tracked series, and episode watches. Every table enables RLS and scopes CRUD to `auth.uid()`. The service-role key must never ship in the client.

Catalog screens call feature query hooks, which use the domain `CatalogRepository` contract and its remote implementation. TMDb and AniList API clients and provider response mappers live under `src/data/remote/`; UI components receive only normalized domain media and episode models. Provider-qualified IDs preserve catalog identity across sources. TanStack Query caches search, detail, and season requests in memory. AniList currently supplies anime metadata but not episode-level data through the selected public query.

Expo client variables use the `EXPO_PUBLIC_` prefix and are embedded in the app bundle. The TMDb API key is therefore a client API credential, not a server secret; keep it local and out of source control and logs. SQLite stores only the metadata snapshot attached to a user's library entries; it does not mirror the catalog.

## Navigation

The route tree has welcome, login, and create-account paths plus five bottom tabs: Home, Search, Watchlist, Watched, and More. Route names are URL/deep-link friendly; modal presentation is used for auth placeholders. Expo Router handles native back behavior and preserves tab stacks.

## Design system

All semantic colors, typography, spacing, radius, and shadows live under `src/theme/`. The UI uses a dark cinematic base, lavender accent, restrained gradients, rounded surfaces, and Expo vector icons.
