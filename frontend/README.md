# Brightloop Web (frontend)

React + TypeScript single-page application for the Brightloop Subscription
Management System, built with Vite.

> **Status:** Base scaffold. The UI is a landing/status page; business screens
> will be added against the contract in
> [`docs/api/api-specification.md`](../docs/api/api-specification.md).

## Stack

| Concern | Choice |
|---|---|
| UI | React 19 |
| Language | TypeScript |
| Build tool | Vite |
| Linting | Oxlint |
| Styling | Plain CSS (no UI framework yet) |
| API base | `/api/v1` (proxied to the Node.js backend) |
| Dev server | `http://localhost:5173` |

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` to
`http://localhost:4000`, so start the backend too:

```bash
cd backend && npm run dev
```

If the backend is not running, the status card reports the API as offline; the
rest of the page still renders.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | Run the TypeScript compiler only |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Serve the production build locally |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | API base URL used by `src/lib/api.ts` |

Copy `.env.example` to `.env` to override locally. Only `VITE_*` variables are
exposed to the browser — never put secrets in them.

## Layout

```text
frontend/
├── public/                  # static assets (favicon)
├── src/
│   ├── lib/api.ts           # fetch wrapper, envelope handling, API types
│   ├── App.tsx              # landing page + API status
│   ├── App.css              # page styles
│   ├── index.css            # global reset
│   └── main.tsx             # React entry point
├── index.html
├── vite.config.ts           # dev proxy to the backend
└── package.json
```

Add feature code under `src/features/<feature>/` and shared UI under
`src/components/`. Keep API calls in `src/lib/api.ts` (or per-feature API
modules) rather than inside components.

## API integration

`src/lib/api.ts` centralises:

- The base URL (`VITE_API_BASE_URL`, default `/api/v1`).
- `credentials: "include"` so the `httpOnly` session cookie is sent.
- Unwrapping of the `{"data": ...}` success envelope.
- Typed `ApiError` handling for the `{"error": ...}` envelope.

```ts
import { apiRequest } from './lib/api'

const products = await apiRequest<Product[]>('/products')
```

Follow the API spec: money is a string (`"1560.00"`), dates are `YYYY-MM-DD`,
and timestamps are ISO-8601 UTC.

## Documentation

- [API specification](../docs/api/api-specification.md)
- [System architecture](../docs/architecture/system-architecture.md)
- [Data flows](../docs/architecture/data-flows.md)
- [State machines](../docs/architecture/state-machines.md)
- [Security & RBAC](../docs/architecture/security-and-rbac.md)
- [User access & authorization](../docs/architecture/user-access-and-authorization.md)
- [Git workflow](../docs/development/git-workflow.md)

## Conventions

- Functional components and hooks only; no class components.
- Keep components presentational; put data access in `src/lib`.
- The frontend never decides access. Render what the API allows and let the
  server enforce every permission.
- Do not store tokens in `localStorage`; authentication uses the `httpOnly`
  session cookie.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before opening a
  pull request.
