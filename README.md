# Watch Later

Watch Later is a local-first movie, TV-series, and anime tracker. Phase 1 establishes the Expo foundation, guest entry, navigation shell, design tokens, and local/cloud service boundaries. Content discovery and tracking are intentionally not implemented yet.

## Requirements

- Node.js 22.13 or newer (Expo SDK 57 minimum; Node 24 is supported)
- npm
- Android Studio and Android SDK for local Android builds
- Xcode for local iOS builds (macOS only)

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in Supabase credentials when available. TMDb remains unused in Phase 1.
3. Start Expo: `npm start`
4. Run Android: `npm run android` (requires an Android SDK and emulator/device)
5. Run iOS: `npm run ios` (macOS with Xcode only)

Expo Go can be used for supported development flows; native run commands build the local development app.

## Checks

- TypeScript: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm test`
- Formatting: `npm run format:check`

## Project map

- `app/`: Expo Router routes and navigation shell
- `src/features/`: feature-specific services and onboarding flow
- `src/domain/`: session models, app errors, and repository contracts
- `src/data/local/`: SQLite schema migrations and local adapters
- `src/data/remote/`: Supabase client configuration
- `src/store/`: persisted application/session state
- `src/theme/`: centralized design tokens
- `tests/`: foundation tests

See [ARCHITECTURE.md](ARCHITECTURE.md) and [DEVELOPMENT.md](DEVELOPMENT.md) for implementation details.
