# Schedula Implementation Log

This document records implementation issues, resolutions, validation evidence, and effort estimates across the Schedula healthcare roadmap. It is intentionally separate from the roadmap so future phases can add operational history without changing the product plan.

## Project metadata

| Field | Value |
| --- | --- |
| Repository | `schedula-bhaskar-pandey` |
| Branch | `feature2/schedula-phase9-deployment-handoff` |
| Current phase | Phase 9 — Remediation and handoff |
| Log created | 2026-10-27 |
| Phase 1 effort | Approximately 2 hours (execution estimate; time was not instrumented) |
| Token reporting | Intentionally excluded; no reliable per-phase token counter was recorded |
| Product roadmap | [docs/schedula-healthcare-roadmap.md](schedula-healthcare-roadmap.md) |
| Project setup | [README.md](../README.md) |

## Product bug backlog — deployment UX review

Reported against the deployed application on 2026-10-28. Status tracks the remediation work in this branch.

| ID | Severity | Journey | Current behavior | Expected behavior | Acceptance criteria | Status |
| --- | --- | --- | --- | --- | --- | --- |
| UX-001 | Critical | Authenticated navigation | Clicking the schedule icon can send an authenticated user to the public home page. | The schedule/dashboard action opens the correct role portal. | Patient and doctor accounts always reach their own portal; wrong-role access redirects safely. | Implemented locally; needs authenticated E2E verification |
| UX-002 | Critical | Authenticated navigation | Logged-in users can see guest actions such as “Sign in” and “Get started”. | Authenticated navigation shows the appropriate patient or doctor portal action. | Guest and authenticated header states are distinct on desktop and mobile. | Implemented locally; needs authenticated E2E verification |
| UX-003 | High | Portal navigation | After landing on home, users have no clear route back to their patient or doctor page. | Portal navigation remains available from every authenticated surface. | Logo and portal actions return to the role-correct destination. | Implemented locally; needs authenticated E2E verification |
| UX-004 | High | Account creation | Signup asks for full name before the role-specific profile is created. | Account creation asks only for email, password, and role. | Full name is absent from signup and remains available for later profile completion. | Implemented locally with migration; deployment pending |
| UX-005 | High | Account creation | Signup requires confirm password. | Signup uses one password field with a visibility toggle and server-side length validation. | Confirmation is absent from signup; passwords remain at least 12 characters. | Resolved in code |
| UX-006 | Medium | Authentication | Password fields do not provide a show/hide control. | Users can reveal or hide password text intentionally. | Login, signup, reset, and update-password controls expose accessible eye-button labels. | Implemented locally |
| UX-007 | High | Forms and feedback | Toast notifications, polished custom errors, and real-time validation are missing or inconsistent. | Errors and success states appear inline and through a shared feedback system. | Async actions expose pending, success, error, retry, and dismissible notification states. | Implemented locally; E2E pending |
| UX-008 | Medium | Forms and controls | Native dropdowns and browser-default controls are used. | Controls use consistent accessible custom components. | Role, specialty, and availability selects support keyboard, focus, escape, and screen-reader behavior. | Implemented locally with Radix Select |
| UX-009 | High | Visual identity | Patient and doctor experiences use the same visual language. | Patients use blue accents and doctors use teal accents. | Role portals and shared states render the correct theme tokens without changing semantic status colors. | Implemented locally |
| UX-010 | Medium | Layout and hierarchy | Pages use excessive horizontal padding, large typography, and many unrelated boxes. | Layout uses available width with restrained surfaces and clearer hierarchy. | Public, auth, patient, doctor, booking, and appointment pages are responsive and visually consistent. | Implemented locally; visual E2E matrix pending |
| UX-011 | High | Interaction design | Hover, focus, pressed, loading, transition, and animation states are missing or incomplete. | Interactive elements communicate state immediately and accessibly. | Buttons, links, tabs, forms, dialogs, selects, and booking actions have visible states; reduced motion is honored. | Implemented locally; visual E2E matrix pending |
| UX-012 | Medium | Product quality | The interface does not yet reflect established healthcare appointment-booking patterns. | Discovery, availability, and booking flows are clear and low-friction. | UX review records patterns from Practo, MediBuddy, Apollo Hospitals, and comparable healthcare products before final polish. | Implemented locally; public discovery and availability-first flow added |
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
- [Max Healthcare doctor discovery](https://www.maxhealthcare.in/find-a-doctor)
- [Fortis specialty and hospital search](https://www.fortishealthcare.com/)
- [MocDoc clinic management](https://mocdoc.com/hospital/clinic-management-system)

### Remediation notes

- Authentication now uses the role-aware `/auth/continue` destination instead of the legacy starter route.
- Signup profile details remain in patient/doctor onboarding; account creation is intentionally minimal.
- The default light surface is white, with blue patient and teal doctor portal accents. Dark mode remains supported.
- Shared password visibility, Radix Select, feedback, and reduced-motion primitives are now used across active forms.

### 2026-10-28 remediation update

- Added a pending migration that makes `profiles.full_name` nullable only before onboarding, changes the signup trigger to validate role only, and completes patient/doctor profile setup through transactional RPCs.
- Added anonymous-safe public doctor discovery RPCs and `/doctors`, `/doctors/[doctorId]`, and `/doctor/profile`; compatibility patient-directory URLs redirect to the public directory.
- Replaced raw query-string authentication error copy with fixed reason codes and recovery actions. Booking return paths are accepted only when they match an internal booking URL.
- Rebuilt the homepage around doctor search, specialty shortcuts, and real upcoming availability. The only new raster asset is a non-identifying outpatient-care photo in `frontend/public/images/appointment-hero.png`; icons remain code-native Lucide icons.
- Removed unused Supabase starter screens/components and aligned pinned Next.js, Supabase, React, and `eslint-config-next` versions. ESLint now uses its native flat config.
- Added unit coverage for portal destinations, safe booking return paths, and blocking compatibility routes. Docker-backed integration and browser E2E checks pass locally.
- Vercel preview remediation: `/auth/error` and the legacy `/patient` compatibility route family now declare `instant = false` before reading query, route, or session data. The initial preview failures identified those routes sequentially; a clean `next build --webpack --debug-prerender` now completes with `BUILD_ID` present.

## Phase summary

| Phase | Status | Estimated time | Bugs found | Bugs resolved | Remaining blockers |
| --- | --- | ---: | ---: | ---: | --- |
| Phase 1 — Foundation | Complete | ~2 hours | 8 | 8 | Hosted Supabase credentials; Docker daemon |
| Phase 2 — Design system | Complete | ~1 hour | — | — | — |
| Phase 3 — Authentication and onboarding | Implemented locally | — | 4 | 4 | Pending migration deployment and Docker-backed verification |
| Phase 4 — Doctor availability | Implemented locally | — | 3 | 3 | Docker-backed verification |
| Phase 5 — Doctor discovery | Implemented locally | — | 4 | 4 | Docker-backed verification |
| Phase 6 — Appointment booking | Implemented locally | — | 2 | 2 | Docker-backed verification |
| Phase 7 — Appointment management | Implemented locally | — | 2 | 2 | Docker-backed verification |
| Phase 8 — Tests and UX quality | Partially validated | — | 6 | 6 | Route-matrix and E2E require Docker/browser services |
| Phase 9 — Deployment and handoff | Preview validation | — | 4 | 4 | Awaiting Vercel preview verification before production promotion |

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

Historical Phase 1 checks passed at the time they were recorded. Current remediation validation (2026-10-28) is:

```text
pnpm typecheck
pnpm test
pnpm lint
```

The current suite contains 34 unit tests. The latest clean production build retry is blocked by Windows `.next` `EPERM` output-directory permissions, and Docker-backed checks were not rerun successfully in this environment. Migration `0006` was applied only to the disposable local Supabase database; no hosted database was modified.

## Remaining environment blockers

### Hosted Supabase connectivity

Hosted SSR/database validation remains pending because project credentials were not present in the ignored `frontend/.env.local` file. No credentials are recorded in this repository.

### Hosted Supabase deployment

Local Supabase validation passed. Applying the migration to a hosted project remains a deployment operation and must be performed through the project’s approved deployment workflow.

## 2026-10-28 interactive dashboard consolidation

- Fixed the live Vercel homepage incident: the hosted schema did not yet contain the public discovery RPCs. The public discovery reader now degrades to its normal empty state while the approved hosted migration workflow is pending; the production seed instructions explicitly require migration `0006` before demo content is expected.
- Fixed the public-route proxy defect so guests and signed-in users can reach `/`, `/doctors`, and `/doctors/[doctorId]`. Authenticated portal destinations now use `/patient` and `/doctor`, while the site logo and role navigation always retain a Home destination.
- Added role dashboards and grouped navigation: patient overview/profile routes, doctor overview/schedule/appointments/profile routes, responsive sidebar navigation, mobile parity, and icon-led quick actions.
- Replaced the doctor profile’s always-open form with a summary card and edit sheet, added the patient profile card/edit sheet, and added atomic profile update RPCs in migration `0007_dashboard-and-profile-rpcs.sql`.
- Rebuilt the homepage hero as a full-bleed background section, added an accessible auto-advancing doctor carousel with reduced-motion behavior, and added specialty-based common care-area cards using non-diagnostic language.
- Added route-level loading skeletons and an idempotent `frontend/drizzle/seed-demo-doctors.sql`. The seed looks up pre-created, verified Auth users by documented demo email and never stores credentials.
- Updated route and portal destination tests. TypeScript, lint, and the 34-test unit suite pass. The clean production build still hits the documented Windows `.next` `EPERM` filesystem blocker after the required retry; Docker integration is blocked by Supabase CLI telemetry write permissions in the host environment.

### Newly tracked issues and status

| ID | Issue | Status |
| --- | --- | --- |
| UX-023 | Public directory routes were intercepted by the session proxy. | Resolved in code; requires preview verification. |
| UX-024 | Authenticated users lacked an explicit Home destination and patient dashboard. | Resolved in code; requires authenticated E2E verification. |
| UX-025 | Profile pages exposed large, scattered forms instead of grouped cards and focused edit controls. | Resolved in code; requires visual verification. |
| UX-026 | Public doctor data could not appear until hosted migration `0006` was applied. | Hosted migration and approved seed execution remain pending. |
| UX-027 | Doctor schedule, appointments, profile, and patient profile lacked a coherent responsive workspace. | Resolved in code; requires Docker/E2E verification. |

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
