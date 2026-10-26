# Schedula - Complete Application

Schedula is a full-stack hospital appointment scheduling system. The project is being developed as a pnpm monorepo with a Next.js frontend and a NestJS backend.

## Current Status

Task 1 currently contains the scheduling domain design and repository guidance:

- Mermaid ERD: [docs/er-diagram.md](docs/er-diagram.md)
- Editable Draw.io ERD: [docs/schedula-erd.drawio](docs/schedula-erd.drawio)
- Repository agent guidance: [AGENTS.md](AGENTS.md)

The frontend and backend applications have not been scaffolded yet. Commands for those applications are documented as planned commands until the scaffolds exist.

## Technology Stack

- Frontend: Next.js with TypeScript
- Backend: NestJS with TypeScript
- Database: PostgreSQL
- ORM: TypeORM
- Package manager and workspace: pnpm
- API testing preparation: Hoppscotch

## Planned Monorepo Structure

```text
schedula-bhaskar-pandey/
├── frontend/                 # Next.js + TypeScript application
├── backend/                  # NestJS + TypeScript application
├── docs/
│   ├── er-diagram.md         # GitHub-renderable Mermaid ERD
│   └── schedula-erd.drawio   # Editable visual ERD
├── AGENTS.md                 # Engineering and repository guidance
├── README.md
├── package.json
├── pnpm-workspace.yaml
└── .gitignore
```

## ERD Modules

The core scheduling ERD contains these modules in order:

1. User
2. Patient
3. Doctor
4. Availability
5. Appointment

The model supports a user having both a Patient profile and a Doctor profile. A doctor-specific availability window can contain multiple appointments.

## Local Setup

The application scaffolds are planned but are not present yet. After they are created, the expected setup commands will be:

```bash
pnpm install
pnpm --filter frontend dev
pnpm --filter backend start:dev
```

Build validation will use:

```bash
pnpm --filter frontend build
pnpm --filter backend build
```

## Task 1 Deliverables

- Establish the Schedula project identity and monorepo conventions.
- Define the five-module scheduling ERD.
- Document one-to-one and one-to-many relationships.
- Prepare the repository for frontend and backend scaffolding.
- Prepare Hoppscotch workspace groups for future authentication and scheduling APIs.

## Future Work

The following work belongs to later tasks and is not implemented yet:

- Next.js frontend scaffolding and scheduling UI
- NestJS backend scaffolding
- Authentication, OAuth, and OTP flows
- Patient and doctor CRUD APIs
- Appointment booking APIs
- PostgreSQL connection and TypeORM entities/migrations
- Notifications and appointment history
- Deployment and production operations

## Hoppscotch Preparation

Hoppscotch will be used for API testing after the backend APIs are implemented. Planned groups include:

- Authentication APIs
- Scheduling APIs

No API endpoints are implemented as part of the current ERD task.

## Security and No-Secret Policy

Never commit passwords, password hashes, API keys, access tokens, private keys, patient data, doctor data, or other personal information. Keep local secrets in ignored environment files and commit only safe example templates such as `.env.example`.

## Contribution Workflow

- Work on a feature branch; do not commit directly to the default branch.
- Use focused conventional commits, such as `docs: add project setup instructions`.
- Review staged files before committing.
- Open pull requests against the integration branch.
- Address review feedback on the same feature branch.
- Merge only after mentor or reviewer approval.
