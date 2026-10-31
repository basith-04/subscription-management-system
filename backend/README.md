# Brightloop API (backend)

Node.js + [Express](https://expressjs.com/) + TypeScript HTTP API for the
Brightloop Subscription Management System.

> **Status:** F01 authentication is implemented: customer registration, login
> for all roles, logout and `GET /auth/me`. The remaining endpoints in
> [`docs/api/api-specification.md`](../docs/api/api-specification.md) are still
> to be built.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20.19+ |
| Language | TypeScript (ES modules) |
| HTTP framework | Express 5 |
| Validation | Zod |
| Database | PostgreSQL (`pg`) |
| Auth | Argon2id password hashes + signed `httpOnly` session cookie |
| Tests | Vitest + Supertest |
| Lint | Oxlint |
| API base | `/api/v1` |
| Default port | `4000` |

## Layout

```text
backend/
├── db/
│   ├── migrations/          # forward-only SQL migrations
│   ├── seeds/reference/     # roles (safe for every environment)
│   ├── migrate.ts           # migration runner
│   └── seed.ts              # reference seed + optional first admin (D-08)
├── src/
│   ├── app.ts               # Express app factory (testable, no listener)
│   ├── index.ts             # bootstrap + graceful shutdown
│   ├── config.ts            # validated environment configuration
│   ├── lib/                 # db, errors, responses, password, session, audit
│   ├── middleware/          # auth, validation, roles, rate limit, errors
│   ├── modules/auth/        # F01 routes/controller/service/repository/schemas
│   └── routes/              # the /api/v1 route registry
├── tests/
│   ├── integration/auth/    # HTTP + real PostgreSQL
│   ├── factories/           # user factory
│   └── helpers/             # test app, database reset, cookie helpers
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

Feature modules live in `src/modules/<module>/` with routes, controller,
service, repository and schemas kept separate. Other modules import only the
module's `index.ts`. Unit tests sit next to the code they test
(`*.test.ts`); only tests that need HTTP or PostgreSQL live under `tests/`.

## Getting started

Start PostgreSQL, then prepare the database:

```bash
cd backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The API starts on `http://localhost:4000`. `db:migrate` creates the F00
baseline (`roles`, `users`, `customers`, `audit_logs`). `db:seed` inserts the
three roles and, when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, the first
admin account (D-08). Both commands are idempotent.

For tests, create a separate database and point `TEST_DATABASE_URL` at it:

```bash
createdb brightloop_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/brightloop_test npm test
```

The integration tests run migrations and truncate their own data; they never
touch the development database.

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
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins; `*` is rejected |
| `DATABASE_URL` | local `brightloop` database | PostgreSQL connection string |
| `TEST_DATABASE_URL` | local `brightloop_test` database | Separate database used by tests |
| `JWT_SECRET` | dev-only fallback | Session signing secret, at least 32 characters; required in production |
| `SESSION_TTL_HOURS` | `8` | Session/cookie lifetime |
| `SESSION_COOKIE_NAME` | `brightloop_session` | `httpOnly` cookie name |
| `COOKIE_SECURE` | `true` in production | Require HTTPS for the cookie; false is rejected in production |
| `COOKIE_DOMAIN` | — | Optional host-only domain override |
| `RATE_LIMIT_MAX` | `10` | Credential attempts per window per IP and per IP + email |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate-limit window (15 minutes) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Optional first-admin seed (D-08) |

Secrets belong in `.env` (ignored by Git) or the deployment environment — never
in the repository.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe |
| `GET` | `/api/v1` | API metadata |
| `GET` | `/api/v1/health` | Health check under the versioned API |
| `POST` | `/api/v1/auth/register` | Customer self-registration; creates user + customer, sets cookie |
| `POST` | `/api/v1/auth/login` | Log in any active role; sets cookie |
| `POST` | `/api/v1/auth/logout` | Clear the session cookie (`204`) |
| `GET` | `/api/v1/auth/me` | Current user from the database-backed session |

Register and login are rate limited per IP and per IP/email combination. The
in-memory limits are per application instance and do not protect across
instances. Registration always assigns the
`customer` role server-side and ignores no privilege fields: unknown fields such
as `role` are rejected with `422`. Passwords must be longer than 8 characters
and contain upper, lower and special characters. Sessions use an `HttpOnly`,
`SameSite=Lax` cookie (`Secure` in production) and are re-checked against
`users.is_active` on every request.

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
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert roles and the optional first admin |
| `npm run db:reset` | Drop and rebuild a development database (never in production) |

## Node.js and Bun

The API runs on either runtime; both lockfiles (`package-lock.json` and
`bun.lock`) are committed.

| Task | Node.js | Bun |
|---|---|---|
| Install | `npm install` | `bun install` |
| Dev (watch) | `npm run dev` | `bun run dev:bun` |
| Run TypeScript directly | — | `bun run start:bun` |
| Build | `npm run build` | `bun run build:bun` |
| Test | `npm test` | `bun run test` |
| Lint | `npm run lint` | `bun run lint` |
| Migrate | `npm run db:migrate` | `bun run db:migrate:bun` |
| Seed | `npm run db:seed` | `bun run db:seed:bun` |

The Bun production path runs `bun src/index.ts` directly, so no compile step is
required. The Node path compiles to `dist/` and runs `node dist/index.js`.

## Docker

The `Dockerfile` has three targets:

```bash
# Node.js (compiled, production dependencies only)
docker build --target node -t brightloop-api:node .

# Bun (runs TypeScript directly)
docker build --target bun -t brightloop-api:bun .

# One-off migration runner (has the TypeScript toolchain and db/ folder)
docker build --target migrate -t brightloop-api:migrate .
```

Run either image:

```bash
docker run --rm -p 4000:4000 \
  -e APP_ENV=production \
  -e JWT_SECRET='replace-with-a-32-character-secret' \
  -e DATABASE_URL='postgres://user:password@host:5432/brightloop' \
  brightloop-api:node
```

Run the migration image against the same database before starting the API:

```bash
docker run --rm \
  -e APP_ENV=production \
  -e JWT_SECRET='replace-with-a-32-character-secret' \
  -e DATABASE_URL='postgres://user:password@host:5432/brightloop' \
  brightloop-api:migrate
```

Or use the repository-level Compose file:

```bash
docker compose up --build          # Node.js
RUNTIME=bun docker compose up --build
```

Compose starts PostgreSQL, runs the migration target once, then starts the API.
The container listens on `0.0.0.0:4000` and exposes `GET /healthz` for health
checks. Set `JWT_SECRET` in the root `.env` before deploying.

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
