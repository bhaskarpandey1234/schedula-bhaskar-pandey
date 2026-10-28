# Schedula Implementation Log

This document records implementation issues, resolutions, validation evidence, and effort estimates across the Schedula healthcare roadmap. It is intentionally separate from the roadmap so future phases can add operational history without changing the product plan.

## Project metadata

| Field | Value |
| --- | --- |
| Repository | `schedula-bhaskar-pandey` |
| Branch | `feature2/schedula-healthcare-mvp` |
| Current phase | Phase 3 — Authentication and Role Onboarding |
| Log created | 2026-10-27 |
| Phase 1 effort | Approximately 2 hours (execution estimate; time was not instrumented) |
| Token reporting | Intentionally excluded; no reliable per-phase token counter was recorded |
| Product roadmap | [docs/schedula-healthcare-roadmap.md](schedula-healthcare-roadmap.md) |
| Project setup | [README.md](../README.md) |

## Product bug backlog — deployment UX review

Reported against the deployed application on 2026-10-28. Status tracks the remediation work in this branch.

| ID | Severity | Journey | Current behavior | Expected behavior | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-001 | Critical | Authenticated navigation | Clicking the schedule icon can send an authenticated user to the public home page. | The schedule/dashboard action opens the correct role portal. | Patient and doctor accounts always reach their own portal; wrong-role access redirects safely. | In progress |
| UX-002 | Critical | Authenticated navigation | Logged-in users can see guest actions such as “Sign in” and “Get started”. | Authenticated navigation shows the appropriate patient or doctor portal action. | Guest and authenticated header states are distinct on desktop and mobile. | In progress |
| UX-003 | High | Portal navigation | After landing on home, users have no clear route back to their patient or doctor page. | Portal navigation remains available from every authenticated surface. | Logo and portal actions return to the role-correct destination. | In progress |
| UX-004 | High | Account creation | Signup asks for full name before the role-specific profile is created. | Account creation asks only for email, password, and role. | Full name is absent from signup and remains available for later profile completion. | Resolved in code |
| UX-005 | High | Account creation | Signup requires confirm password. | Signup uses one password field with a visibility toggle and server-side length validation. | Confirmation is absent from signup; passwords remain at least 12 characters. | Resolved in code |
| UX-006 | Medium | Authentication | Password fields do not provide a show/hide control. | Users can reveal or hide password text intentionally. | Login, signup, reset, and update-password controls expose accessible eye-button labels. | In progress |
| UX-007 | High | Forms and feedback | Toast notifications, polished custom errors, and real-time validation are missing or inconsistent. | Errors and success states appear inline and through a shared feedback system. | Async actions expose pending, success, error, retry, and dismissible notification states. | In progress |
| UX-008 | Medium | Forms and controls | Native dropdowns and browser-default controls are used. | Controls use consistent accessible custom components. | Role, specialty, and availability selects support keyboard, focus, escape, and screen-reader behavior. | In progress |
| UX-009 | High | Visual identity | Patient and doctor experiences use the same visual language. | Patients use blue accents and doctors use teal accents. | Role portals and shared states render the correct theme tokens without changing semantic status colors. | In progress |
| UX-010 | Medium | Layout and hierarchy | Pages use excessive horizontal padding, large typography, and many unrelated boxes. | Layout uses available width with restrained surfaces and clearer hierarchy. | Public, auth, patient, doctor, booking, and appointment pages are responsive and visually consistent. | In progress |
| UX-011 | High | Interaction design | Hover, focus, pressed, loading, transition, and animation states are missing or incomplete. | Interactive elements communicate state immediately and accessibly. | Buttons, links, tabs, forms, dialogs, selects, and booking actions have visible states; reduced motion is honored. | In progress |
| UX-012 | Medium | Product quality | The interface does not yet reflect established healthcare appointment-booking patterns. | Discovery, availability, and booking flows are clear and low-friction. | UX review records patterns from Practo, MediBuddy, Apollo Hospitals, and comparable healthcare products before final polish. | In progress |
| UX-013 | High | All forms | Submitting a form with one invalid field resets all entered fields. | Valid values remain available and only the invalid field is highlighted. | Server actions return field errors and submitted values; no valid user input is lost after an error. | Implemented locally; deployed verification pending |
| UX-014 | High | Doctor availability | Creating a schedule gives no confirmation and generated slots are only visible after scrolling. | The user receives confirmation and a direct path to the generated schedule. | Success toast, confirmation banner, schedule anchor, and “View schedule” CTA appear after creation. | Implemented locally; deployed verification pending |
| UX-015 | High | Patient and doctor portals | Tab changes can take several seconds with no immediate selected or pressed state. | The clicked tab immediately communicates pending navigation. | Tabs show active/pending styling and prevent duplicate clicks while data loads. | Implemented locally; deployed verification pending |
| UX-016 | High | Server-rendered pages | Slow navigation shows no page-level loader or skeleton. | Users see meaningful loading feedback during route transitions. | Appointments, doctor schedule, discovery, booking, and confirmation routes expose accessible loading states. | Implemented locally; deployed verification pending |
| UX-017 | Critical | Email verification | Supabase links containing `code` fail because the callback only accepts `token_hash`. | Both supported verification link formats complete successfully. | Code exchange and token-hash verification redirect to a clear verified-login state. | Implemented locally; deployed verification pending |
| UX-018 | High | Signup and verification | Signup confirmation is a separate page and verification errors expose technical messages. | Signup confirmation is an accessible dialog/toast and verification errors are user-friendly. | Account-created dialog offers a sign-in CTA; raw Supabase errors are never shown. | Implemented locally; deployed verification pending |
| UX-019 | High | Login | Unverified users receive an unclear generic authentication error. | Login explains that email verification is required and offers a recovery path. | `email_not_confirmed` produces a meaningful message and supported resend action. | Implemented locally; deployed verification pending |
| UX-020 | High | Documentation and data model | The conceptual ERD contains fields and relationships that do not match the implemented schema. | The ERD reflects the current profile, patient, doctor, availability, and appointment model. | Stale address fields and obsolete `user_id` relationships are removed; implementation-only tables are documented separately. | Implemented |
| UX-021 | Medium | Profile onboarding | Doctors and patients must type values that could be selected from guided options. | Forms provide curated selects, date controls, phone country codes, and useful examples. | Specialty, experience, timezone, phone code, and other suitable profile fields have accessible options with an “Other” fallback where needed. | Implemented locally; deployed verification pending |
| UX-022 | Medium | Doctor profile | Doctors must write biographies from scratch. | Doctors can generate an editable bio from their entered profile details. | A local deterministic bio generator fills the bio field without sending personal data externally. | Implemented locally; deployed verification pending |

### Research references

- [Practo doctor discovery](https://www.practo.com/doctors)
- [Practo real-time appointment booking](https://help.practo.com/practo-search/what-is-practo-instant/)
- [MediBuddy doctor consultations](https://www.medibuddy.in/doctor-consultations)
- [Apollo Hospitals appointment access](https://www.apollohospitals.com/contact-us)

### Remediation notes

- Authentication now uses the role-aware `/auth/continue` destination instead of the legacy starter route.
- Signup profile details remain in patient/doctor onboarding; account creation is intentionally minimal.
- The default light surface is white, with blue patient and teal doctor portal accents. Dark mode remains supported.
- Shared password visibility, custom select, feedback, and reduced-motion primitives are being introduced incrementally.

## Phase summary

| Phase | Status | Estimated time | Bugs found | Bugs resolved | Remaining blockers |
| --- | --- | ---: | ---: | ---: | --- |
| Phase 1 — Foundation | Complete | ~2 hours | 8 | 8 | Hosted Supabase credentials; Docker daemon |
| Phase 2 — Design system | Complete | ~1 hour | — | — | — |
| Phase 3 — Authentication and onboarding | Implemented | — | — | — | Local Supabase/Docker and hosted credentials remain environment-dependent |
| Phase 4 — Doctor availability | Not started | — | — | — | — |
| Phase 5 — Doctor discovery | Not started | — | — | — | — |
| Phase 6 — Appointment booking | Not started | — | — | — | — |
| Phase 7 — Appointment management | Not started | — | — | — | — |
| Phase 8 — Tests and UX quality | Not started | — | — | — | — |
| Phase 9 — Deployment and handoff | Not started | — | — | — | — |

## Phase 1 — Supabase/Next.js Foundation

### 1. Stale Next.js development lock and duplicate server

- **Symptom:** `next dev` reported that another development server was already running and referenced `frontend/.next/dev/lock`.
- **Root cause:** An earlier development process had left a generated Next.js lock/cache behind.
- **Resolution:** Identified the active process from the Next.js log, terminated its process tree, and removed the generated `.next` directory before restarting.
- **Validation:** The frontend started successfully and served the home page with HTTP 200.
- **Status:** Resolved.

### 2. Port 3000 collision

- **Symptom:** Next.js attempted to move to port 3001 because port 3000 was reported as occupied.
- **Root cause:** The stale server process and lock from the previous development session were still associated with port 3000.
- **Resolution:** Stopped the stale process and restarted with `pnpm run dev -- --port 3000`.
- **Validation:** `http://localhost:3000` returned HTTP 200 and contained the Schedula title.
- **Status:** Resolved.

### 3. Google Fonts blocked the production build

- **Symptom:** `next build` failed while fetching Geist from `fonts.googleapis.com`.
- **Root cause:** The generated starter imported `Geist` through `next/font/google`, which requires network access during the build.
- **Resolution:** Removed the network font import and used the existing system font stack while keeping the generated UI styling.
- **Validation:** The production build compiled and generated all routes successfully.
- **Status:** Resolved.

### 4. Turbopack Windows filesystem failure

- **Symptom:** Turbopack failed with an internal `EPERM` error while creating `.next` output directories.
- **Root cause:** The Windows execution environment could not complete Turbopack’s worker filesystem operation.
- **Resolution:** Configured the production build script to use `next build --webpack`, which avoids the failing Turbopack build path.
- **Validation:** The webpack production build completed successfully.
- **Status:** Resolved.

### 5. ESLint scanned generated `.next` output

- **Symptom:** Linting reported thousands of errors from generated JavaScript under `.next/dev`.
- **Root cause:** The flat ESLint configuration did not globally ignore Next.js build and test output.
- **Resolution:** Added global ignores for `.next`, build output, coverage, Playwright reports, and test results.
- **Validation:** `pnpm lint` completed successfully.
- **Status:** Resolved.

### 6. Playwright strict locator failure

- **Symptom:** The smoke test failed because `getByRole("main")` matched two elements.
- **Root cause:** The generated page contains an outer `<main>` and a nested tutorial `<main>`.
- **Resolution:** Scoped the smoke assertion to the first main landmark with `.first()`.
- **Validation:** `pnpm test:e2e` passed with one Chromium test.
- **Status:** Resolved.

### 7. Next.js development cross-origin warning

- **Symptom:** The dev server warned that requests from `127.0.0.1` to the Next.js HMR resource were blocked.
- **Root cause:** Next.js 16 requires development origins to be explicitly allowed when the browser and server use different localhost aliases.
- **Resolution:** Added `127.0.0.1` and `localhost` to `allowedDevOrigins` in `frontend/next.config.ts`.
- **Validation:** The Playwright smoke test ran successfully without the cross-origin warning.
- **Status:** Resolved.

### 8. ESLint preset mismatch

- **Symptom:** Aligning `eslint-config-next` to the installed Next.js 16 version caused a circular configuration error under the starter’s ESLint setup.
- **Root cause:** The generated flat-config compatibility layer was stable with its scaffolded `eslint-config-next` version, not the attempted upgrade.
- **Resolution:** Restored the generated compatible `eslint-config-next` version and retained the explicit generated-output ignores.
- **Validation:** `pnpm lint` completed successfully.
- **Status:** Resolved.

## Validation record

The following checks passed during Phase 1:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter frontend db:generate
pnpm build
pnpm test:e2e
```

The generated Drizzle migration was inspected and was not applied to a hosted database.

## Remaining environment blockers

### Hosted Supabase connectivity

Hosted SSR/database validation remains pending because project credentials were not present in the ignored `frontend/.env.local` file. No credentials are recorded in this repository.

### Local Supabase startup

The Supabase CLI configuration is tracked, but `pnpm supabase:start` could not start the local stack because the Docker Desktop Linux daemon was not running. Start Docker Desktop before retrying.

## Future phase template

Copy this section for each completed roadmap phase.

### Phase N — Name

- **Scope:**
- **Status:**
- **Estimated time:**
- **Bugs found:**
- **Bugs resolved:**
- **Fixes and design decisions:**
- **Tests and validation:**
- **Remaining risks or blockers:**
- **Token reporting:** Excluded from this log.
