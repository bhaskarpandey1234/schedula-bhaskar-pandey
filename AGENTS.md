# AGENTS.md

## Purpose

This file contains the engineering standards and project context for agents and contributors working on Schedula. Follow these rules for all future work in this repository.

## Engineering Standards

- Work as an experienced production engineer, not as a task-only intern.
- Understand the repository, architecture, and existing changes before editing.
- Prefer maintainable, secure, testable, and extensible solutions.
- Do not blindly follow incomplete or contradictory requirements; identify risks and assumptions.
- Avoid both toy implementations and unnecessary over-engineering.
- Preserve existing user work and avoid unrelated changes.
- Keep each change focused, coherent, and reviewable.

## Workflow

- Inspect relevant files, configuration, and Git status before making changes.
- Use planning mode for ambiguous, architectural, or multi-step work.
- Ask for clarification only when a decision materially affects the implementation.
- Make the smallest coherent change that fully solves the requested task.
- Follow repository-native conventions and reuse existing dependencies where appropriate.
- Use `apply_patch` for repository file edits.
- Never commit secrets, credentials, personal data, generated files, or build output.
- Do not use destructive Git or filesystem commands without explicit authorization.
- Validate changes with appropriate tests, builds, linting, type checks, and documentation checks.
- Report what changed, what was verified, and any remaining risks or assumptions.

## Git and Collaboration Workflow

- Do not commit directly to the default branch.
- Use the repository branch pattern defined by the project workflow: `intern/<name>-main` for the integration branch and `feature1/<feature-name>` for the first feature branch.
- Use focused commits with meaningful conventional commit messages, such as `docs: add project ER diagram` or `chore: initialize monorepo`.
- Do not create random, catch-all, or misleading commits.
- Review staged files before every commit and include only files belonging to that logical change.
- Push feature branches with upstream tracking enabled.
- Target pull requests from the feature branch into the integration branch.
- Keep changes on the same feature branch when responding to review comments.
- Merge only after the assigned mentor or reviewer approves the pull request.
- Include validation results, known limitations, future work, individual contribution, and the Loom link in the pull request when applicable.

## Schedula Project Context

- Project name: `Schedula - Complete Application`.
- Domain: hospital appointment scheduling.
- Repository: `schedula-bhaskar-pandey`.
- Frontend: Next.js with TypeScript.
- Backend: NestJS with TypeScript.
- Planned database: PostgreSQL with TypeORM.
- Planned repository layout includes `frontend`, `backend`, and `docs`.
- The initial monorepo should include `frontend/`, `backend/`, `docs/`, a root `README.md`, `package.json`, `pnpm-workspace.yaml`, and `.gitignore`.
- The first ERD deliverable belongs at `docs/er-diagram.md` and must render on GitHub with Mermaid.
- The project uses pnpm workspace commands for validation, including frontend and backend build checks.
- Do not implement authentication, APIs, database connections, TypeORM entities, migrations, scheduling UI, notifications, or deployment unless explicitly requested.

## ERD and Domain Rules

- The core ERD entities are `User`, `Patient`, `Doctor`, `Availability`, and `Appointment`.
- Keep those entities in that order unless project requirements explicitly change.
- Use realistic production-oriented fields rather than an artificially minimal schema.
- Store only `password_hash`; never store plaintext passwords.
- Prefer `date_of_birth` over mutable `age`.
- Include appropriate audit timestamps such as `created_at` and `updated_at`.
- Preserve timezone information for scheduling.
- Use uniqueness, foreign-key, overlap, and appointment-allocation rules where appropriate.
- Avoid adding unrelated healthcare entities until their requirements are defined.
- Treat the ERD as a conceptual design until backend migrations and database constraints are implemented.

## Security and Data Modeling

- Follow OWASP guidance for password hashing, authentication, authorization, and sensitive-data handling.
- Treat patient and doctor contact information as sensitive personal data.
- Do not log passwords, password hashes, tokens, or unnecessary patient information.
- Use least-privilege access patterns for protected data.
- Prefer explicit status values and documented state transitions for scheduling workflows.
- Use timezone-aware date/time handling for appointments and other real-world events.
- Do not claim a schema is production-ready without considering validation, constraints, indexes, privacy, auditability, and failure cases.

## Documentation and Research

- Keep documentation synchronized with implementation.
- Use authoritative technical and security references for design decisions.
- For healthcare data modeling, consider established standards such as HL7 FHIR.
- For password handling, follow OWASP password-storage guidance.
- For PostgreSQL scheduling fields, use appropriate timezone-aware date/time types.
- Record important assumptions and deferred design decisions in documentation.
- Keep current Task 1 deliverables clearly separated from future application functionality.
- Document local setup, frontend and backend start commands, ERD links, current status, future scope, and no-secret warnings in the project README when README work is requested.
- Treat Hoppscotch setup as API-testing preparation only until API implementation is explicitly requested.
- Do not record secrets, API keys, personal data, or generated artifacts in documentation or the repository.

## Task 1 Scope and Validation

- Task 1 covers the project foundation, the five-module ERD, README setup, Hoppscotch preparation, build/start validation, Loom walkthrough, and pull-request workflow.
- Task 1 explicitly excludes authentication endpoints, OAuth/OTP, patient or doctor CRUD APIs, appointment APIs, PostgreSQL connections, TypeORM entities and migrations, scheduling UI, notifications, and deployment.
- Before handoff, verify frontend and backend builds, startup behavior, Mermaid rendering, internal links, TypeScript usage, absence of secrets and generated artifacts, and intended Git status.
- When validation commands are required, use the project commands from `plan.txt`, including `pnpm install`, `pnpm --filter frontend build`, and `pnpm --filter backend build`.

## Validation and Handoff

- Verify the changed files are exactly within the requested scope.
- Run relevant tests, builds, linting, type checks, or documentation checks.
- Confirm no secrets or generated artifacts are tracked.
- Review the final diff before handoff.
- Summarize changed files, validation results, assumptions, and remaining risks.

## Production Safety Gate

- `AGENTS.md` is versioned and must remain synchronized with the repository workflow; do not add it to `.gitignore`.
- Never push a deployment branch unless `pnpm release:check` passes, including lint, typecheck, unit tests, and the production build.
- A successful TypeScript check, lint run, or unit-test run is not a substitute for a successful production build.
- Run integration and E2E tests when Docker and local Supabase are available. If infrastructure prevents them, report the exact blocker and do not claim the release is fully validated.
- If a build fails in `.next`, retry once after removing only the generated `frontend/.next` directory. Do not delete source files or use destructive Git commands.
- For failures involving prerendering, Suspense, `connection()`, `cookies()`, `headers()`, `params`, or `searchParams`, reproduce with `next build --debug-prerender` and inspect the affected route before pushing.
- Before every push, review `git diff --cached --name-status`, `git diff --cached --check`, and the final commit file list. Exclude secrets, environment files, generated output, and personal data.
- After pushing a deployment branch, verify the deployment provider status and exercise the affected production route before reporting success.
