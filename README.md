# Subscription Management System

A unified **Subscription Management System** developed as part of the *Odoo x Make-A-Ton 9.0 Kochi Hackathon 2026*.

## About the Project

This repository contains our team's implementation of the Subscription Management System problem statement for the Odoo Hackathon.

The project focuses on developing a centralized software solution based on the given problem statement, with the goal of addressing the challenges faced by businesses in managing subscription-based operations.

Further details about the project, its architecture, technologies, and implemented features will be documented as development progresses.

## Team Members

This project is developed by:

| Name | Role |
|---|---|
| **Abdul Basith P V** | Team Leader |
| Evan Iwin Biju | Team Member |
| Ashin Chacko | Team Member |
| Harijith T S | Team Member |

## Hackathon

**Event:** Odoo x Make-A-Ton 9.0 Kochi Hackathon 2026
**Problem Statement:** Subscription Management System

## Documentation

Architecture and planning documents live in [`docs/`](docs/README.md). They describe the **proposed** design. The application is at the **early implementation stage**: F01 authentication (registration, login, logout and sessions) and F06 (products and variants) are implemented end-to-end; remaining business features are still in the scaffold stage.

| Document | Description |
|---|---|
| [System Architecture](docs/architecture/system-architecture.md) | Requirements, stack, high-level architecture |
| [Database Design](docs/database/database-design.md) | Schema, ER diagram, snapshot rules |
| [Data Flows](docs/architecture/data-flows.md) | Key workflows end to end |
| [State Machines](docs/architecture/state-machines.md) | Subscription and invoice lifecycles |
| [API Specification](docs/api/api-specification.md) | REST API contract draft |
| [Billing Engine](docs/architecture/billing-engine.md) | Billing logic and duplicate-invoice prevention |
| [Security & RBAC](docs/architecture/security-and-rbac.md) | Roles, permissions, protection rules |
| [User Access & Authorization](docs/architecture/user-access-and-authorization.md) | Authentication, entitlements, sessions, webhooks |
| [Development Roadmap](docs/development/development-roadmap.md) | Phases and team work streams |
| [Git Workflow](docs/development/git-workflow.md) | Branching, pull requests, code review |
| [Directory Guidelines](docs/development/directory-guidelines.md) | Repository structure, naming, imports, shared-file rules |
| [Feature Breakdown](docs/implementation/feature-breakdown.md) | End-to-end features, dependencies, assignment |

## Repository structure

| Path | Description |
|---|---|
| [`backend/`](backend/README.md) | Node.js + Express REST API (TypeScript) |
| [`frontend/`](frontend/README.md) | React + TypeScript SPA built with Vite |
| [`docs/`](docs/README.md) | Architecture, API, database, and process documentation |

### Quick start

```bash
# terminal 1 — API on http://localhost:4000
cd backend
cp .env.example .env      # adjust DATABASE_URL and JWT_SECRET if needed
npm install
npm run db:migrate        # create the F00 baseline schema
npm run db:seed           # roles (+ optional first admin from .env)
npm run dev

# terminal 2 — web app on http://localhost:5173
cd frontend
npm install
npm run dev
```

The API needs PostgreSQL. The default `DATABASE_URL` expects a local
`brightloop` database; create it first (`createdb brightloop`). Tests use a
separate `TEST_DATABASE_URL` database.

### Node.js or Bun

Both apps support npm and Bun; lockfiles for both package managers are committed.
Pick one runtime per app.

| Task | Node.js | Bun |
|---|---|---|
| Install | `npm install` | `bun install` |
| Dev | `npm run dev` | `bun run dev` |
| Test | `npm test` | `bun run test` |
| Build | `npm run build` | `bun run build` |

The backend also has explicit Bun scripts: `bun run dev:bun` (watch) and
`bun run start:bun` (run TypeScript directly).

## Docker

Prerequisites: Docker Engine with Compose v2.

```bash
cp .env.example .env       # set JWT_SECRET (32+ characters) and DB passwords
docker compose up --build
# web  → http://localhost:8080
# api  → http://localhost:4000
```

Compose starts PostgreSQL, runs the one-off `migrate` service (migrations +
role seed + optional first admin), then starts the API once the database is
healthy. Choose a random URL-safe PostgreSQL password (letters, digits, hyphen
or underscore), because Compose places it in the database URL. The database
port binds only to localhost. Node.js is the default runtime. To build and run the Bun variants
instead:

```bash
RUNTIME=bun docker compose up --build
```

Both application Dockerfiles are multi-target:

| Image | `node` target | `bun` target |
|---|---|---|
| `backend` | Compiles TypeScript, runs `node dist/index.js` | Runs `bun src/index.ts` directly |
| `frontend` | Vite build via npm, served by nginx | Vite build via Bun, served by nginx |

The backend also has a `migrate` target for the one-off migration/seed job.

Build a single image:

```bash
docker build --target node    -t brightloop-api:node ./backend
docker build --target bun     -t brightloop-api:bun  ./backend
docker build --target migrate -t brightloop-api:migrate ./backend
docker build --target node -t brightloop-web:node ./frontend
docker build --target bun  -t brightloop-web:bun  ./frontend
```

Compose can be configured with environment variables or a root `.env` (see
[`.env.example`](.env.example)): `RUNTIME`, `API_PORT`, `WEB_PORT`,
`POSTGRES_*`, `JWT_SECRET`, `COOKIE_SECURE`, `ALLOWED_ORIGINS`, and the optional
`ADMIN_*` / `STAFF_*` seed variables. Local Compose defaults to `APP_ENV=development`
and plain HTTP, so `COOKIE_SECURE=false` is used there. For production, set
`APP_ENV=production`, use HTTPS and set `COOKIE_SECURE=true`. The
web container proxies `/api/` to `http://api:4000`, so keep the Compose service
name `api` (or add a network alias) when deploying outside Compose.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type-check,
migrations/seeds, tests, and builds for **both Node.js and Bun** against a
PostgreSQL service, then builds both Docker targets for each runtime plus the
backend migration image.
