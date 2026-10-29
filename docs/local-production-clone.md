# Run Schedula Locally with a Fresh Local Database

This guide runs Schedula locally with the same application code and database schema as production, while keeping the production database unchanged. The local database starts empty, and test users are created locally.

## Safety rule

Use a separate local Supabase/Postgres database. Do **not** point the local application at the production database if you need to guarantee that production data cannot change.

The repository contains the ordered Drizzle migrations in `frontend/drizzle/` (`0000` through `0007`). Production data is not copied into this local setup. Create separate local test users instead.

## Prerequisites

- Node.js 22 or newer
- pnpm 10 or newer
- Docker Desktop, running before starting Supabase
- Supabase CLI
- Access to the production Supabase project and its backup/export process

## 1. Install dependencies

Run these commands from the repository root:

```powershell
pnpm install
```

## 2. Start the local Supabase stack

```powershell
pnpm supabase:start
pnpm exec supabase status
```

The local stack normally provides:

- API URL: `http://127.0.0.1:54321`
- Database port: `54322`
- Studio: `http://127.0.0.1:54323`
- Local email inbox: `http://127.0.0.1:54324`

Copy the local API URL, publishable/anon key, and database URL from `supabase status`. Confirm that the database URL points to `127.0.0.1` or `localhost`.

## 3. Create the local environment file

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

Edit `frontend/.env.local` and enter the local values:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local-anon-or-publishable-key>
DATABASE_URL=<local-database-url>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Keep `frontend/.env.local` private. It is ignored by Git. Never commit database credentials, service-role keys, API keys, or personal data.

## 4. Apply the repository migrations locally

```powershell
pnpm --filter frontend db:migrate
```

This applies the repository migrations to the local database only. It does not change production as long as `DATABASE_URL` is local.

## 5. Start the application

```powershell
pnpm dev
```

Open the application at:

```text
http://localhost:3000
```

Use local Supabase Studio at `http://127.0.0.1:54323` to inspect the local database.

## 6. Create local test users

Create accounts through the application's local **Sign up** page. These users exist only in the local Supabase database and are separate from production accounts.

Local authentication email messages can be viewed in Mailpit:

```text
http://127.0.0.1:54324
```

Create separate local patient and doctor users if you need to test both roles. Test bookings, cancellations, profiles, and availability remain local.

## 7. Stop the local environment

To stop the application, press `Ctrl+C` in the terminal running `pnpm dev`.

To stop Supabase while preserving its local data:

```powershell
pnpm supabase:stop
```

Start it again later with:

```powershell
pnpm supabase:start
```

## Commands to avoid

Do not run these commands with a production `DATABASE_URL`:

```powershell
pnpm --filter frontend db:migrate
supabase db push
supabase db reset
```

Do not use production Supabase URL/key values in the local environment unless you intentionally accept that local sign-ups, bookings, cancellations, profile updates, and other writes can affect production.

## Verification checklist

- `DATABASE_URL` points to local Supabase.
- `NEXT_PUBLIC_SUPABASE_URL` points to `127.0.0.1` or `localhost`.
- The local database was initialized from the repository migrations.
- Local test users were created through the local application.
- No production credentials or personal data were committed.
- The application opens at `http://localhost:3000`.
- Test bookings and profile changes are made only against the local copy.

## Important limitations

The local database does not contain production users or production application data. Production changes will not appear locally. If a production-like data copy is required in the future, use an approved backup or export process and keep it separate from the default fresh-local workflow.
