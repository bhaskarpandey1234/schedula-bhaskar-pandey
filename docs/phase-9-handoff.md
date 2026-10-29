# Phase 9 Deployment Handoff

This document records the production deployment evidence for the Schedula MVP. It must contain operational facts only; never add passwords, database URLs, service-role keys, API keys, access tokens, or patient/doctor personal data.

## Release metadata

| Field | Value |
| --- | --- |
| Repository | `https://github.com/bhaskarpandey1234/schedula-bhaskar-pandey` |
| Release branch | `feature2/schedula-phase9-deployment-handoff` |
| Integration target | `intern/bhaskar-pandey-main` |
| Release commit | `6648864` |
| Deployed URL | `https://schedula-bhaskar-pandey.vercel.app` |
| Loom walkthrough | `TBD` |

## Provider configuration checklist

- [x] Create the hosted Supabase production project (`schedula-healthcare`, ref `eqckoayhycvbkxqudocw`).
- [x] Apply the ordered migrations in `frontend/drizzle/` using the secure IPv4 session pooler; the temporary database credential was not added to Vercel or Git.
- [x] Confirm the migrated public schema contains seven tables; provider dashboard is healthy.
- [x] Enable Supabase email/password sign-up and email confirmation (default provider configuration).
- [x] Set the production Site URL to the deployed HTTPS URL.
- [x] Add exact production redirects for `/auth/confirm?next=/onboarding` and `/auth/confirm?next=/auth/update-password`.
- [ ] Configure confirmation and recovery email templates with `{{ .TokenHash }}` and the matching `email` or `recovery` OTP type.
- [x] Configure Vercel with `frontend/` as the project root, Next.js preset, and Node 22.
- [x] Add only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` to Vercel production.
- [x] Keep `RESEND_*` unset for this release.
- [ ] Create a future demo doctor availability through the application without recording credentials here.

## Validation evidence

Record the command, date, commit, and result for each check:

Local validation on 2026-10-28 passed after the integration harness applied all six Drizzle migrations:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (28 tests)
- `pnpm test:integration` (3 tests)
- `pnpm test:e2e` (8 desktop/mobile tests)
- `pnpm build`

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Production journey checks:

- [ ] Patient registration, email confirmation, onboarding, doctor discovery, booking, confirmation, and cancellation.
- [ ] Doctor registration, email confirmation, onboarding, availability creation, and appointment visibility.
- [ ] Cancellation decreases the appointment count and restores exactly one slot allocation.
- [ ] Password recovery reaches `/auth/update-password` through `/auth/confirm`.
- [ ] Desktop and mobile checks pass on the deployed URL.
- [x] No secret, personal data, generated output, database credential, or service-role key is tracked.

## Known limitations

Doctor-initiated appointment cancellation is deferred. The doctor portal can view appointment status, while patient-owned future cancellation is the release-validated cancellation path. Resend booking confirmation email delivery is disabled for this release; in-app notifications and Supabase authentication email flows remain enabled.
