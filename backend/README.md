# Brightloop API (backend)

Node.js + [Express](https://expressjs.com/) + TypeScript HTTP API for the
Brightloop Subscription Management System.

> **Status:** Base scaffold. Only health endpoints exist; the contract in
> [`docs/api/api-specification.md`](../docs/api/api-specification.md) describes
> the endpoints to implement.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20.19+ |
| Language | TypeScript (ES modules) |
| HTTP framework | Express 5 |
| Validation | Zod |
| Database (planned) | PostgreSQL |
| Auth (planned) | `httpOnly` session cookie per the API spec |
| Tests | Vitest + Supertest |
| Lint | Oxlint |
| API base | `/api/v1` |
| Default port | `4000` |

## Layout

```text
backend/
├── src/
│   ├── app.ts               # Express app factory (testable, no listener)
│   ├── index.ts             # bootstrap + graceful shutdown
│   ├── config.ts            # environment-backed configuration
│   ├── version.ts
│   ├── middleware/          # request ID, error envelope, 404
│   └── routes/              # route modules (health for now)
├── tests/                   # Vitest + Supertest
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

Future feature modules should follow the architecture docs:
`identity`, `customers`, `products`, `plans`, `subscriptions`, `invoices`,
`payments`, `reports`, `policies`, `sessions`, `webhooks`, and `audit`. Keep
transport (routes) thin and put business rules in service modules.

## Getting started

```bash
cd backend
cp .env.example .env      # optional; defaults work for local development
npm install
npm run dev
```

The API starts on `http://localhost:4000`.

### Verify

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/api/v1/health
```

```json
{
  "data": {
    "status": "ok",
    "service": "brightloop-api",
    "version": "0.1.0"
  }
}
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Runtime environment (`development`, `test`, `production`) |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `4000` | HTTP port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `DATABASE_URL` | — | PostgreSQL connection string (future) |

Secrets belong in `.env` (ignored by Git) or the deployment environment — never
in the repository.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe |
| `GET` | `/api/v1` | API metadata |
| `GET` | `/api/v1/health` | Health check under the versioned API |

All future endpoints must follow the envelopes, status codes, pagination, money
and date rules in the [API specification](../docs/api/api-specification.md).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start with `tsx watch` (restarts on change) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Type-check source and tests |
| `npm run lint` | Run Oxlint |

## Documentation

- [System architecture](../docs/architecture/system-architecture.md)
- [API specification](../docs/api/api-specification.md)
- [Database design](../docs/database/database-design.md)
- [Data flows](../docs/architecture/data-flows.md)
- [State machines](../docs/architecture/state-machines.md)
- [Billing engine](../docs/architecture/billing-engine.md)
- [Security & RBAC](../docs/architecture/security-and-rbac.md)
- [User access & authorization](../docs/architecture/user-access-and-authorization.md)

## Conventions

- Money is returned as strings with two decimals (`"1560.00"`), never JSON
  numbers.
- Dates use `YYYY-MM-DD`; timestamps use ISO-8601 UTC.
- Every response uses the `{"data": ...}` / `{"error": ...}` envelopes.
- The backend is the source of truth for authorization. Never trust a
  frontend-supplied subscription status or role.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before opening a pull
  request.
