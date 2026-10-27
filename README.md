# Schedula Healthcare

Schedula is a healthcare appointment-booking application. Phase 1 establishes a secure, TypeScript-first Next.js foundation using the official Supabase starter. Booking workflows arrive in later roadmap phases.

## Phase 3 status

Implemented:

- Next.js 16 + React + TypeScript frontend in `frontend/`.
- Supabase SSR browser/server clients and Next.js proxy session refresh.
- shadcn/ui configuration with the New York style, neutral base color, and CSS variables.
- Drizzle/PostgreSQL configuration and a generated, unapplied migration for `profiles`, `patients`, and `doctors`.
- Vitest foundation tests and Playwright browser smoke-test configuration.
- Docker-backed local Supabase configuration in [`supabase/config.toml`](supabase/config.toml).
- Calm clinical design tokens with light/dark semantic themes.
- Reusable responsive navigation, layout, state, and shadcn-style UI primitives.
- Public landing page and shared branded authentication shell.
- Supabase email/password authentication through validated Server Actions, email confirmation, password reset, and cookie-based session routing.
- Role-aware sign-up and protected patient/doctor onboarding with portal redirects.
- Local Drizzle migration with profile provisioning trigger, immutable roles, audit timestamp triggers, and owner-only RLS policies.

Deferred: availability sessions, appointment slots, appointments, notifications, public doctor discovery, hosted migrations, and deployment.

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
pnpm --filter frontend db:migrate
pnpm build
pnpm test:e2e
```

Playwright may require a one-time browser installation:

```bash
pnpm --filter frontend exec playwright install chromium
```

The Drizzle generate command writes SQL under `frontend/drizzle/`. Start local Supabase first, ensure `frontend/.env.local` contains its server-only `DATABASE_URL`, then run `pnpm --filter frontend db:migrate` to apply the local schema. Hosted migrations and production deployment are intentionally deferred to Phase 9.

## Future roadmap

The roadmap covers shared UI, authentication onboarding, doctor availability, patient discovery, booking concurrency, cancellation and notifications, integration quality gates, and deployment. The conceptual five-module ERD is documented in [`docs/er-diagram.md`](docs/er-diagram.md).

## Security

Do not commit passwords, database URLs, service-role keys, API keys, access tokens, private keys, or patient/doctor personal data. Keep secrets in ignored `.env.local` files or hosting-provider settings. Do not use the service-role key in browser code.

## Branch workflow

Phase work belongs on feature branches and should target the integration branch after review. Use focused conventional commits and keep build output, local Supabase state, and dependency directories untracked.
