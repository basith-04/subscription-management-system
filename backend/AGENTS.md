# AGENTS.md — backend

Guidance for AI coding agents working in `backend/`. Read this before changing
code. Human setup instructions live in [`README.md`](README.md).

## Project context

Brightloop is a subscription management platform built for the Odoo x Make-A-Ton
9.0 Kochi Hackathon 2026. The repository documentation is the source of truth:

- [`docs/architecture/system-architecture.md`](../docs/architecture/system-architecture.md)
- [`docs/api/api-specification.md`](../docs/api/api-specification.md)
- [`docs/database/database-design.md`](../docs/database/database-design.md)
- [`docs/architecture/data-flows.md`](../docs/architecture/data-flows.md)
- [`docs/architecture/state-machines.md`](../docs/architecture/state-machines.md)
- [`docs/architecture/billing-engine.md`](../docs/architecture/billing-engine.md)
- [`docs/architecture/security-and-rbac.md`](../docs/architecture/security-and-rbac.md)
- [`docs/architecture/user-access-and-authorization.md`](../docs/architecture/user-access-and-authorization.md)

If code and docs disagree, fix the code or update the docs in the same change.
Do not silently invent a different contract.

## Stack and constraints

- Node.js 20.19+, TypeScript, Express 5. The architecture docs specify a
  Node/Express modular monolith; keep it that way.
- ES modules (`"type": "module"`). Relative imports must include the `.js`
  extension, even in `.ts` files.
- PostgreSQL is the primary database. Do not substitute another database
  without a documented decision.
- Validate request bodies and query parameters with Zod. Keep schemas next to
  the feature that owns them.
- Keep the service runnable with `npm run dev` and no external services for the
  base scaffold.
- No secrets in the repository. Configuration comes from environment variables
  through `src/config.ts`.

## Commands

```bash
npm install
npm run dev        # tsx watch src/index.ts
npm run build      # tsc -p tsconfig.json
npm start          # node dist/index.js
npm test           # vitest run
npm run typecheck  # tsc --noEmit -p tsconfig.test.json
npm run lint       # oxlint src tests
```

Always run `npm run lint`, `npm run typecheck`, and `npm test` after changes.
Add or update tests for new behaviour.

## Layout rules

- `src/app.ts` — Express app factory. No `listen()` here; tests import it.
- `src/index.ts` — bootstrap, listener, graceful shutdown. Wiring only.
- `src/config.ts` — environment parsing and validated configuration.
- `src/middleware/` — cross-cutting Express middleware.
- `src/routes/` — route registration; keep handlers thin.
- Add feature modules under `src/features/<feature>/` (or
  `src/modules/<feature>/`) with `routes`, `service`, and `repository` files.
  Pick one convention and stay consistent.
- Routes translate HTTP to service calls; services enforce business rules;
  repositories own SQL. Do not put SQL in route handlers.
- Prefer typed errors (`ApiError`) and let the central error handler produce the
  envelope. Express 5 forwards rejected promises automatically.
- Log at the boundary, not at every layer.

## API contract rules

- Base path: `/api/v1`. Use plural, kebab-case resources.
- Success envelope: `{"data": ...}`. Lists add `{"meta": {...}}`.
- Error envelope:
  `{"error": {"code": "...", "message": "...", "details": [...], "request_id": "..."}}`.
- Status codes: `201` create, `200` action/read, `204` delete, `400`, `401`,
  `403`, `404`, `409`, `422`, `429`, `500` as defined in the API spec.
- Money is serialized as a string with two decimals (`"1560.00"`); tax rates use
  three (`"18.000"`). Never use JSON numbers for money.
- Dates: `YYYY-MM-DD`; timestamps: ISO-8601 UTC.
- Pagination: `page` (1-based), `page_size` (default 20, max 100), `sort`,
  `q`. Reject unknown filters/sorts with `422`.
- Auth: `httpOnly` session cookie. Never return tokens to JavaScript-accessible
  storage. Enforce role checks on the server for every protected route.

## Domain rules

- Subscription lifecycle: `Draft → Quotation → Confirmed → Active → Closed`.
- Invoice lifecycle: `Draft → Confirmed → Paid` (plus the proposed `cancelled`
  status).
- Billing must never create duplicate invoices or skip a period. Use the
  period-uniqueness rules in the database and billing docs.
- Plan policies (early closure, pause, renewal) are checked at the moment of the
  action.
- Authorization is server-side only. UI hiding is never a security control.
- Session revocation and entitlement changes must be auditable.

## Testing

- Unit tests for business rules and state transitions.
- Integration tests for HTTP handlers, envelopes, and status codes.
- Use `createApp(...)` + Supertest (see `tests/health.test.ts`).
- Cover money rounding, duplicate-invoice prevention, and permission failures.

## Git

- Branch from `main`; do not commit directly to `main` unless explicitly asked.
- Commit messages: `type(scope): short summary` in the imperative mood, e.g.
  `feat(subscriptions): add pause policy check`.
- Keep changes focused. Do not mix refactors with feature work.
- Update `README.md` and relevant docs when behaviour or setup changes.
