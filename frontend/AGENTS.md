# AGENTS.md — frontend

Guidance for AI coding agents working in `frontend/`. Read this before changing
code. Human setup instructions live in [`README.md`](README.md).

## Project context

Brightloop is a subscription management platform built for the Odoo x Make-A-Ton
9.0 Kochi Hackathon 2026. The repository documentation is the source of truth:

- [`docs/api/api-specification.md`](../docs/api/api-specification.md) — API
  contract, envelopes, status codes, money/date rules.
- [`docs/architecture/system-architecture.md`](../docs/architecture/system-architecture.md)
- [`docs/architecture/data-flows.md`](../docs/architecture/data-flows.md)
- [`docs/architecture/state-machines.md`](../docs/architecture/state-machines.md)
- [`docs/architecture/security-and-rbac.md`](../docs/architecture/security-and-rbac.md)
- [`docs/architecture/user-access-and-authorization.md`](../docs/architecture/user-access-and-authorization.md)

If the UI needs data or behaviour the API spec does not define, update the spec
(or raise it with the backend) instead of inventing a private contract.

## Stack and constraints

- React 19 + TypeScript + Vite.
- Plain CSS for now. Do not add a UI framework or state manager without a
  documented decision.
- Node `>=20.19` or Bun 1.x.
- Both `package-lock.json` (npm) and `bun.lock` (Bun) are committed. Keep them
  in sync when dependencies change: run `npm install` and `bun install`.
- The app talks to the Node.js API at `/api/v1`; Vite proxies `/api` to
  `http://localhost:4000` in development.
- Authentication uses an `httpOnly` session cookie. Never read or store tokens
  in JavaScript-accessible storage.
- Docker: `Dockerfile` exposes `node` and `bun` build targets, both served by
  nginx. `docker-compose.yml` selects one via `RUNTIME=node|bun`.

## Commands

```bash
# Node.js
npm install
npm run dev        # Vite dev server on :5173
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run preview    # serve dist/

# Bun
bun install
bun run dev
bun run build
bun run typecheck
bun run lint
bun run preview
```

Run lint, typecheck, and build under both runtimes when practical (CI does
this). There is no test runner yet; add Vitest when component/unit tests are
needed.

Docker:

```bash
docker build --target node -t brightloop-web:node .
docker build --target bun  -t brightloop-web:bun  .
```

## Layout rules

- `src/lib/` — API client, types, and pure helpers. No React imports here.
- `src/components/` — reusable presentational components.
- `src/features/<feature>/` — feature screens, hooks, and feature-specific API
  modules.
- `src/App.tsx` — top-level composition and routing.
- `src/index.css` — global reset/tokens; `App.css` — page-level styles.
- `nginx.conf` — production static serving, SPA fallback, and `/api/` proxy.
- Prefer colocating a component's CSS with the feature as the app grows.
- Use the `@/` import alias only if it is configured in both `vite.config.ts`
  and `tsconfig.app.json`; otherwise use relative imports.

## API rules

- All HTTP goes through `src/lib/api.ts` (or per-feature modules built on it).
- Unwrap the `{"data": ...}` envelope in the client; components receive plain
  domain objects.
- Surface `ApiError.code` and `ApiError.message` from the `{"error": ...}`
  envelope. Do not show raw server messages for `500` responses.
- Money is a **string** with two decimals (`"1560.00"`). Never parse it into a
  float for display or arithmetic; use integer minor units or a decimal helper.
- Dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC. Format for display at the
  edge, keep the wire format intact in state.
- Pagination is `page` (1-based) and `page_size` (default 20, max 100).

## Security and UX rules

- The server enforces every permission. Hiding a button is a convenience, not a
  security control.
- Never trust client-side role checks for access decisions.
- Do not log secrets, session cookies, or full API error payloads containing
  personal data.
- Show loading, empty, error, and unauthorized states for every data view.
- Keep pages fast: the requirement is under 2 seconds with thousands of
  subscriptions.

## Code style

- Function components + hooks only.
- TypeScript strict mode; avoid `any`. Prefer `unknown` plus narrowing.
- Keep components small; extract hooks when data logic grows.
- Use semantic HTML and accessible labels; every interactive element must be
  keyboard reachable.
- Match the existing visual language (CSS variables in `src/App.css`).

## Git

- Branch from `main`; do not commit directly to `main` unless explicitly asked.
- Commit messages: `type(scope): short summary` in the imperative mood, e.g.
  `feat(plans): add billing frequency selector`.
- Keep changes focused. Update `README.md` when setup or behaviour changes.
