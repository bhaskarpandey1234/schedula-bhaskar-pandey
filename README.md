# Schedula Healthcare

Schedula is a healthcare appointment-booking application. The TypeScript-first Next.js application supports authenticated patient discovery and transactional appointment booking against future doctor availability.

## Day 4 status

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
- Doctor profile editing, recurring weekly consulting days, custom date overrides, and generated wave-scheduling slots in a rolling 30-day booking window.
- Authenticated patient doctor directory with name search, specialty filtering, doctor profiles, and upcoming availability windows.
- Patient-only discovery read functions that expose directory-safe fields without widening owner-only table policies.
- Transactional patient booking with capacity-safe slot reservation, duplicate-booking protection, optional visit reason, dedicated review route, durable confirmation page, and persisted patient/doctor notifications.
- Patient appointment management with upcoming, past, and cancelled views plus ownership-enforced future cancellation that releases exactly one slot allocation.
- Doctor schedule appointment visibility with patient names and lifecycle status.
- Optional server-side Resend booking confirmation email delivery; missing configuration or delivery failure never invalidates a confirmed appointment.
- Razorpay-ready payment architecture with INR fee snapshots, capacity-safe payment holds, webhook idempotency, refund tracking, and payment-aware appointment states.
- Durable notification/outbox delivery for payment, cancellation, refund, and appointment reminders, with a provider-neutral rescheduling foundation.

Phase 8 quality gates are complete. Phase 9 adds deployment-safe authentication redirects and the release handoff runbook. Day 4 extends the existing booking flow with payment and notification infrastructure. Hosted Supabase migration, Razorpay configuration, Supabase Cron, and Vercel deployment require provider dashboard access and are recorded in [`docs/day-4-payments-operations.md`](docs/day-4-payments-operations.md) and [`docs/phase-9-handoff.md`](docs/phase-9-handoff.md).

Doctor-initiated appointment cancellation remains explicitly deferred. The deployed release validates patient cancellation and capacity restoration.

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
│   ├── er-diagram.md         # Conceptual five-module scheduling ERD
│   ├── day-4-payments-operations.md
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

Optional transactional email can be enabled by adding `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to `frontend/.env.local`. Payment and reminder delivery additionally requires the server-only Razorpay and `JOB_RUNNER_SECRET` values documented in [`docs/day-4-payments-operations.md`](docs/day-4-payments-operations.md). These values must never be committed.

Start local Supabase when Docker is available:

```bash
pnpm supabase:start
pnpm exec supabase status
pnpm dev
```

The application is available at <http://localhost:3000>. If variables are absent, the starter renders its safe configuration warning instead of attempting a connection.

## Validation commands

Before pushing a deployment branch, run the release gate:

```bash
pnpm release:check
```

This runs frontend linting, type checking, unit tests, and the production build. Run `pnpm test:integration` and `pnpm test:e2e` separately when Docker Desktop and local Supabase are available.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm --filter frontend db:generate
pnpm --filter frontend db:migrate
pnpm build
pnpm test:e2e
pnpm test:quality
```

Playwright may require a one-time browser installation:

```bash
pnpm --filter frontend exec playwright install chromium
```

`pnpm test:integration` and `pnpm test:e2e` start and inspect local Supabase, apply the existing Drizzle migrations, and refuse non-local database URLs. They use temporary `@example.test` users that are removed after each test run. Docker Desktop must be running; no hosted Supabase credentials are used by these suites. `pnpm test:quality` runs the complete local quality gate, including linting, type checking, unit tests, integration tests, browser journeys, and the production build.

The Drizzle generate command writes SQL under `frontend/drizzle/`. Start local Supabase first, ensure `frontend/.env.local` contains its server-only `DATABASE_URL`, then run `pnpm --filter frontend db:migrate` to apply the local schema. Hosted migrations and production deployment are intentionally deferred to Phase 9.

## Phase 9 deployment handoff

The Vercel project should use `frontend/` as its root directory and Node 22. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in Vercel. Keep `DATABASE_URL`, Supabase service-role keys, demo credentials, and any `RESEND_*` values out of Git and out of Vercel unless a future server-side feature requires them. Apply the ordered Drizzle migrations from a secure migration environment, then configure Supabase Auth’s production Site URL, exact confirmation/recovery redirects, and OTP-based email templates. See the handoff document for release evidence and limitations.

## Future roadmap

The roadmap covers shared UI, authentication onboarding, doctor availability, patient discovery, payment-backed booking, refunds, rescheduling, durable notifications, reminders, integration quality gates, and deployment. The conceptual five-module ERD is documented in [`docs/er-diagram.md`](docs/er-diagram.md); implementation and provider setup are documented in [`docs/day-4-payments-operations.md`](docs/day-4-payments-operations.md).

## Security

Do not commit passwords, database URLs, service-role keys, API keys, access tokens, private keys, or patient/doctor personal data. Keep secrets in ignored `.env.local` files or hosting-provider settings. Do not use the service-role key in browser code.

## Branch workflow

Phase work belongs on feature branches and should target the integration branch after review. Use focused conventional commits and keep build output, local Supabase state, and dependency directories untracked.
