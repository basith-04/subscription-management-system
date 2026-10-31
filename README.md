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

Architecture and planning documents live in [`docs/`](docs/README.md). They describe the **proposed** design. The application is at the **scaffold stage**: the Node.js API and React frontend have their base structure, but the business features are not implemented yet.

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
npm install
npm run dev

# terminal 2 — web app on http://localhost:5173
cd frontend
npm install
npm run dev
```

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
docker compose up --build
# web  → http://localhost:8080
# api  → http://localhost:4000
```

Node.js is the default runtime. To build and run the Bun variants instead:

```bash
RUNTIME=bun docker compose up --build
```

Both Dockerfiles are multi-target:

| Image | `node` target | `bun` target |
|---|---|---|
| `backend` | Compiles TypeScript, runs `node dist/index.js` | Runs `bun src/index.ts` directly |
| `frontend` | Vite build via npm, served by nginx | Vite build via Bun, served by nginx |

Build a single image:

```bash
docker build --target node -t brightloop-api:node ./backend
docker build --target bun  -t brightloop-api:bun  ./backend
docker build --target node -t brightloop-web:node ./frontend
docker build --target bun  -t brightloop-web:bun  ./frontend
```

Compose can be configured with environment variables or a root `.env` (see
[`.env.example`](.env.example)): `RUNTIME`, `API_PORT`, `WEB_PORT`, and
`ALLOWED_ORIGINS`. The web container proxies `/api/` to `http://api:4000`, so
keep the Compose service name `api` (or add a network alias) when deploying
outside Compose.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type-check,
tests, and builds for **both Node.js and Bun**, then builds both Docker targets
for each runtime.
