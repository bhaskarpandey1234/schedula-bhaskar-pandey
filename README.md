# Schedula Healthcare

Schedula is a healthcare appointment-booking application. Phase 1 establishes a secure, TypeScript-first Next.js foundation using the official Supabase starter. Booking workflows arrive in later roadmap phases.

## Phase 1 status

Implemented:

- Next.js 16 + React + TypeScript frontend in `frontend/`.
- Supabase SSR browser/server clients and Next.js proxy session refresh.
- shadcn/ui configuration with the New York style, neutral base color, and CSS variables.
- Drizzle/PostgreSQL configuration and a generated, unapplied migration for `profiles`, `patients`, and `doctors`.
- Vitest foundation tests and Playwright browser smoke-test configuration.
- Docker-backed local Supabase configuration in [`supabase/config.toml`](supabase/config.toml).

Deferred: availability sessions, appointment slots, appointments, notifications, onboarding, custom portal UI, hosted migrations, and deployment.

## Architecture

```text
schedula-bhaskar-pandey/
├── frontend/                 # Next.js + Supabase SSR application
│   ├── lib/db/               # Drizzle client and roadmap-aligned schema
│   ├── drizzle/              # Generated, unapplied SQL migration
│   ├── tests/                # Vitest and Playwright smoke tests
│   └── .env.example          # Safe environment-variable template
├── supabase/config.toml      # Local Supabase CLI configuration
├── docs/
│   ├── er-diagram.md         # Conceptual future scheduling ERD
│   └── schedula-healthcare-roadmap.md
├── package.json              # Workspace scripts
└── pnpm-workspace.yaml
```

Supabase Auth owns identity records in `auth.users`. The Phase 1 migration references those IDs from `profiles`; patient and doctor records use one-to-one profile IDs. The migration is intentionally not applied to any hosted project.

## Prerequisites

- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop for local Supabase
- An existing Supabase project for hosted connectivity checks

## Local setup

```bash
pnpm install
```

Copy `frontend/.env.example` to `frontend/.env.local` (use `Copy-Item` in PowerShell or `cp` in macOS/Linux), then fill in the values.

Fill in `frontend/.env.local` with the project URL, publishable key, and server-only PostgreSQL `DATABASE_URL`. Never commit that file. The publishable key is safe for browser use; database credentials are not.

Start local Supabase when Docker is available:

```bash
pnpm supabase:start
pnpm exec supabase status
pnpm dev
```

The application is available at <http://localhost:3000>. If variables are absent, the starter renders its safe configuration warning instead of attempting a connection.

## Validation commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter frontend db:generate
pnpm build
pnpm test:e2e
```

Playwright may require a one-time browser installation:

```bash
pnpm --filter frontend exec playwright install chromium
```

The Drizzle command generates SQL under `frontend/drizzle/`; it does not apply a migration. Hosted migrations and production deployment are intentionally deferred.

## Future roadmap

The roadmap covers shared UI, authentication onboarding, doctor availability, patient discovery, booking concurrency, cancellation and notifications, integration quality gates, and deployment. The conceptual five-module ERD is documented in [`docs/er-diagram.md`](docs/er-diagram.md).

## Security

Do not commit passwords, database URLs, service-role keys, API keys, access tokens, private keys, or patient/doctor personal data. Keep secrets in ignored `.env.local` files or hosting-provider settings. Do not use the service-role key in browser code.

## Branch workflow

Phase work belongs on feature branches and should target the integration branch after review. Use focused conventional commits and keep build output, local Supabase state, and dependency directories untracked.
