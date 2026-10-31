# File Index

> One row per file: its purpose, its owning feature, and its current status.
> **Status:** F00, F01, F03, F04, F05, F06, F07, F11, and F12 are implemented. Entries marked **EXISTING** have working code; **SCAFFOLDED** entries are placeholders unless otherwise noted.
> **Companion docs (do not duplicate here):** [Directory Guidelines](../development/directory-guidelines.md) (rules: where code lives, naming, imports, shared files) · [Feature Breakdown](feature-breakdown.md) (ownership model, waves, Definition of Done) · [System Architecture](../architecture/system-architecture.md) (why the pieces fit) · [API Specification](../api/api-specification.md) (the contract each endpoint must match) · [Database Design](../database/database-design.md) (the schema each migration must copy).
> **This file is additive.** It does not change any of the above.

---

## 0. How to use this file

Three purposes:

1. **Find the right file fast.** Search by module name (`products`, `invoices`, `billing`), by layer (`controller`, `service`, `repository`), or by feature (`F06`, `F07`).
2. **Know who is expected to touch a file.** Each row names an owning feature. Cross-feature edits (touching another feature's module) go through the owner; see [Directory Guidelines §L.2](../development/directory-guidelines.md).
3. **Track progress.** Any file that still contains `PLACEHOLDER` is unimplemented. The "progress" command at the bottom of this file counts them.

### Status legend

| Mark | Meaning |
|---|---|
| **EXISTING** | Working code, committed before the scaffold. Not modified by the scaffold script. Do not delete. |
| **SCAFFOLDED** | Placeholder with a one-line docstring and a `PLACEHOLDER — replace with implementation` marker. The owner replaces the body; the docstring stays. |
| **NOT SCAFFOLDED** | Deliberately missing, per [Directory Guidelines §A.3](../development/directory-guidelines.md) ("Unused optional files are simply not created"). The owner creates it if/when needed. |

### Ownership names

`F00` (foundations, whole team) · `F01`…`F18` — see [Feature Breakdown §6–§8](feature-breakdown.md). Two features sometimes share a folder (`auth` is F01 + F02) — the row's "Owner" column says who does what.

---

## 1. Backend — `backend/`

| Documentation file | Status | Purpose |
|---|---|---|
| `docs/implementation/f09-checklist.md` | EXISTING | F09 prerequisite assessment, blocked items and implementation checklist. |

| Documentation file | Status | Purpose |
|---|---|---|
| `docs/implementation/auth-integration-checklist.md` | EXISTING | F01 gate, manual walkthrough and pending F02/deployment checklist. |
| `backend/tests/integration/catalogue/reference-data.api.test.ts` | EXISTING | F05 PostgreSQL persistence, session authorization, audit and foreign-key integration tests. |

F01 frontend additions: `frontend/src/features/auth/` contains the login and
registration pages, password field, auth layout, guarded shells, query hook,
route guards, CSS and component tests. These implement the F01 paths; password
reset screens remain pending F02.

| F01 frontend file | Status | Purpose |
|---|---|---|
| `frontend/src/features/auth/AccountShell.tsx` | EXISTING | Minimal authenticated portal and back-office shells with logout. |
| `frontend/src/features/auth/AuthLayout.tsx` | EXISTING | Authentication layout and card. |
| `frontend/src/features/auth/LoginPage.tsx` | EXISTING | Login form and role-based routing. |
| `frontend/src/features/auth/RegisterPage.tsx` | EXISTING | Customer registration form. |
| `frontend/src/features/auth/PasswordField.tsx` | EXISTING | Password input and rule checklist. |
| `frontend/src/features/auth/schemas.ts` | EXISTING | Frontend authentication validation. |
| `frontend/src/features/auth/guards.tsx` | EXISTING | Authentication and role route guards. |
| `frontend/src/features/auth/useAuth.ts` | EXISTING | Cached current-user query and safe return paths. |
| `frontend/src/features/auth/auth.css` | EXISTING | Authentication form styles. |
| `frontend/src/features/auth/auth.test.tsx` | EXISTING | Authentication component and guard tests. |

### 1.1 Entry, config and version (EXISTING)

| File | Status | Owner | Purpose |
|---|---|---|---|
| `backend/src/app.ts` | EXISTING | F00 | Express app factory; middleware order; `createApp(config)` used by tests. **No business logic here.** |
| `backend/src/index.ts` | EXISTING | F00 | Bootstrap — reads config, calls `createApp`, listens, wires graceful shutdown. |
| `backend/src/config.ts` | EXISTING | F00 | The **only** file that reads `process.env`. Extend it when adding env vars. |
| `backend/src/config.test.ts` | EXISTING | F01 | Production configuration regression tests. |
| `backend/src/version.ts` | EXISTING | F00 | `VERSION` string surfaced in the health payload. |

### 1.2 Middleware — `backend/src/middleware/`

| File | Status | Owner | Purpose | Notes |
|---|---|---|---|---|
| `error-handler.ts` | EXISTING | F00 | `ApiError`, `notFoundHandler`, `errorHandler`. The **only** place that writes the error envelope. | Extend `ApiError` here; nothing else writes `.json({error…})`. |
| `request-id.ts` | EXISTING | F00 | Attaches `X-Request-Id` (incoming header or UUID) to every request. | Consumed by `error-handler` for `request_id` in the envelope. |
| `authenticate.ts` | EXISTING | F01 | Verify session cookie and reload user and role from PostgreSQL; rejects inactive users. | Called by protected routes. |
| `require-role.ts` | EXISTING | F01 | `requireRole(...roles)` — `403 FORBIDDEN` when `req.user.role` isn't allowed. | F03 extends with `useCan`-style checks for menus. |
| `permissions.ts` | EXISTING | F00 | F01 named permissions and customer scoping from the authenticated identity. | Extend with business permissions as their endpoints are implemented. |
| `permissions.test.ts` | EXISTING | F01 | Customer scope and authorization regression tests. | Never trust a client-supplied customer id. |
| `validate.ts` | EXISTING | F00 | Zod-driven validation of body/params/query → `422 VALIDATION_ERROR` with `details[]`. | Every non-public endpoint goes through it. |
| `rate-limit.ts` | EXISTING | F01 | In-memory rate limiter for credential endpoints. | Global and distributed limiting remain pending. |

### 1.3 Shared helpers — `backend/src/lib/`

| File | Status | Owner | Purpose | Consumed by |
|---|---|---|---|---|
| `db.ts` | EXISTING | F00 | Database client, transaction helpers and Postgres error mapping. | Every repository. |
| `money.ts` | EXISTING | F00 | Decimal-safe money: string arithmetic, `ROUND_HALF_UP` to 2 dp. | Products (F06), plans (F07), billing (F12), payments (F13). |
| `dates.ts` | EXISTING | F00 | Validates ISO calendar dates and resolves an injected instant in `APP_TIMEZONE`. | F09 and later date-dependent features. |
| `dates.test.ts` | EXISTING | F00 | Business-timezone and calendar-date regression tests. | Date helpers. |
| `pagination.ts` | EXISTING | F00 | Parse `page` / `page_size` (max 100), build `meta`; whitelisted sort parsing. | Every list endpoint. |
| `responses.ts` | EXISTING | F00 | `ok`, `created`, `list`, `noContent`. | Every controller. |
| `errors.ts` | EXISTING | F00 | `ApiError` class (status, code, message, details). | Services, middleware. |
| `error-codes.ts` | EXISTING | F00 | Central list of error codes. | Everywhere an error is thrown. |
| `mailer.ts` | EXISTING | F00 | Nodemailer wrapper around SMTP (Mailpit locally). Returns a sanitized result on failure. | F02 (reset links), F11 (send invoice). |
| `mailer.test.ts` | EXISTING | F00 | SMTP success, failure and configuration regression tests. | Mail infrastructure. |
| `audit.ts` | EXISTING | F00 | Transactional insert-only audit row writer. | Every state-changing service. |
| `session.test.ts` | EXISTING | F01 | JWT signature, expiry-claim and algorithm regression tests. | Authentication. |
| `scheduler.ts` | EXISTING | F00 | `registerJob(name, schedule, fn)`, `runJobNow(name)` — `node-cron` wrapper. | `jobs/index.ts` and `<module>.jobs.ts` files. |
| `state-machine.ts` | EXISTING | F00 | Transaction-client subscription transition with locking, conditional update and audit. | F09 service must wire it; other entities/fields remain future work. |
| `state-machine.test.ts` | EXISTING | F00 | Conditional transition and audit failure regression tests. | Shared state-machine helper. |
| `tests/integration/db/state-machine.test.ts` | EXISTING | F00 / F09 | Test-only PostgreSQL transition and audit rollback checks. | Uses temporary tables, not the F09 production schema. |
| `tests/integration/db/state-machine.concurrent.test.ts` | EXISTING | F00 / F09 | Test-only concurrent conditional transition checks. | Uses an isolated test schema, not the F09 production schema. |
| `logger.ts` | SCAFFOLDED | F00 | Request-scoped structured logger. **Never log secrets, passwords, or PII.** | Every layer; don't `console.log`. |
| `constants.ts` | SCAFFOLDED | F00 | Cross-module constants (role names, status enums). Mirror of `frontend/src/lib/constants.ts`. | Middleware, services. |

### 1.4 Scheduler registry — `backend/src/jobs/`

| File | Status | Owner | Purpose |
|---|---|---|---|
| `index.ts` | EXISTING | F00 | The **one** place that imports every `*.jobs.ts` and calls `registerJob`. Features add new jobs by exporting them from their own `*.jobs.ts` — this file should not need edits after the first wire-up. |

### 1.5 Billing engine — `backend/src/billing/` (no HTTP)

This folder is the engine, not the API. The API lives in `modules/billing-runs/`. See [Directory Guidelines §K](../development/directory-guidelines.md).

| File | Status | Owner | Purpose |
|---|---|---|---|
| `calculators/pricing.ts` | EXISTING | F09 | Pure `resolveUnitPrice`, `computeLine`, `computeTotals`; decimal-safe pre-discount pricing. |
| `calculators/pricing.test.ts` | EXISTING | F09 | Price precedence, tax rounding, precision and input-boundary tests. |
| `calculators/periods.ts` | EXISTING | F12 | Pure period-date math: `periodStart`/`periodEnd`; month-end clamping; leap years. |
| `calculators/tax.ts` | SCAFFOLDED | F09 | Pure per-line tax computation; aggregates `invoice_tax_details` from rounded lines. |
| `calculators/discounts.ts` | SCAFFOLDED | F15 | Pure discount eligibility and allocation: `selectEligibleDiscount`, `allocateToLines`. |
| `invoice-builder.ts` | EXISTING | F12 | Assembles a draft invoice from subscription data — snapshots, tax summary, discount application. |
| `run-billing.ts` | EXISTING | F12 | Orchestrates a billing run: `FOR UPDATE SKIP LOCKED`, one transaction per subscription, cursor advance, catch-up loop. |
| `billing.jobs.ts` | EXISTING | F12 | The scheduled entry point: `runBilling({ asOf })` — plain function, idempotent. |

### 1.6 Business modules — `backend/src/modules/`

Every module folder has the **same 7 files**. The 7-file purpose table comes first, then the 16 modules and what makes each one special.

#### 1.6.1 The 7 files per module (structural)

| File | Purpose | Rules |
|---|---|---|
| `index.ts` | **Public API of the module.** Exports the service functions that other modules may call. | Nothing else is exported (no controllers, no repositories, no schemas). See [Directory Guidelines §C.2](../development/directory-guidelines.md). |
| `<module>.routes.ts` | HTTP endpoints. Declares method + path + middleware chain (`authenticate`, `requireRole`, `validate`) + controller. | Thin. No `req`/`res` body logic. |
| `<module>.controller.ts` | HTTP handlers. Read validated input, call **one** service function, return via `lib/responses.ts`. | No SQL. No business rules. |
| `<module>.service.ts` | Business rules, state transitions, transactions (`withTransaction`), audit logging. | The **only** place a business rule lives. No `req`/`res`. |
| `<module>.repository.ts` | SQL / ORM queries for this module's tables. | Private to the module — never imported from another module. |
| `<module>.schemas.ts` | Zod request schemas (body, params, query) for this module. | Shape/format only — no DB or business rules. |
| `<module>.constants.ts` | Statuses / enums for this module (values match DB `CHECK` constraints). | Keep in sync with the DB design. |

#### 1.6.2 The 16 modules

| Module | API prefix | Owner | Tables (owned) | Notable extra files / notes |
|---|---|---|---|---|
| `auth` | `/auth` | F01 (register/login/me/logout) + F02 (forgot/reset/change) | `password_reset_tokens` (F02) | F01 backend implemented; F02 remains pending. |
| `subscriptions.state-machine.ts` | — | F09 / F10 | — | F09 pure transition rules exist; transactional service wiring remains pending. |
| `subscriptions.state-machine.test.ts` | — | F09 | — | Unit tests cover every F09 action/state pair and invalid states. |
| `subscriptions.schemas.test.ts` | — | F09 | — | Request-shape, input-whitelist, date and filter regression tests. |
| `subscriptions.validation.ts` | — | F09 | — | Pure F07 availability and per-line plan-minimum guard; transaction wiring is pending. |
| `subscriptions.validation.test.ts` | — | F09 | — | Availability and minimum-quantity guard regression tests. |
| `users` | `/users` | F03 | `users`, `roles` | ✅ **IMPLEMENTED.** Includes last-admin guard and self-deactivation prevention. |
| `customers` | `/customers`, `/me/profile` | F04 | `customers` (from F00) | ✅ **IMPLEMENTED.** Exports `CustomerSelect` on the frontend side. |
| `products` | `/products`, `/variants` | F06 | `products`, `product_variants` | ✅ **IMPLEMENTED.** Exports `computeEffectivePrice` from `index.ts`. |
| `plans` | `/plans` | F07 | `plans`, `plan_products` | ✅ **IMPLEMENTED.** Exports `assertPlanAvailable` from `index.ts` — F09 uses it. |
| `quotation-templates` | `/quotation-templates` | F08 | `quotation_templates`, `quotation_template_items` | Exports `getTemplateForUse` — F09 uses it. |
| `subscriptions` | `/subscriptions`, `/quotations` | F09 (create/confirm/cancel) + F10 (activate/pause/renew/close) | `subscriptions`, `subscription_items` (sequence `subscription_number_seq`) | **Two routers** — `subscriptions.routes.ts` and `quotations.routes.ts` — because a quotation **is** a subscription in `draft`/`quotation` status. Adds `subscriptions.state-machine.ts`. F10 also adds `subscriptions.jobs.ts` (activation, quote expiry, expiry/renewal jobs). |
| `taxes` | `/taxes` | F05 | `tax_rules` | ✅ **IMPLEMENTED.** Simplest CRUD — a good pattern reference for F06/F07. |
| `payment-terms` | `/payment-terms` | F05 | `payment_terms` | ✅ **IMPLEMENTED.** Implements the F00 reference slice in full. |
| `discounts` | `/discounts`, `/subscriptions/:id/discounts` | F15 | `discounts`, `discount_products`, `subscription_discounts`, `discount_redemptions` | Grant/revoke routes declared here even though the URL is `/subscriptions/…` (per [Directory Guidelines §K](../development/directory-guidelines.md)). |
| `invoices` | `/invoices`, `/subscriptions/:id/invoices` | F11 | `invoices`, `invoice_items`, `invoice_tax_details`, `billing_runs` (sequence `invoice_number_seq`) | ✅ **IMPLEMENTED.** Owns the `payment_state` derivation — one function, exported from `index.ts`. Adds `invoices.state-machine.ts`. F11 also adds `invoices.jobs.ts` for the "send unsent invoice" retry. |
| `billing-runs` | `/billing/*` | F12 | (uses `billing_runs` via `invoices`) | ✅ **IMPLEMENTED.** **API only.** Wraps `billing/run-billing.ts`. Admin "Run now" lives here. |
| `payments` | `/payments`, `/invoices/:id/payments` | F13 | `payments`, `payment_allocations` | Calls the invoice state machine's `paid`/`confirmed` entry points. Never writes invoice status directly. |
| `portal` | `/me/subscriptions`, `/me/invoices` | F14 | – | Composes `subscriptions`, `invoices`, `payments` with customer scoping. **No business rules of its own.** Uses the F00 `scopeToCustomer` helper on every query. |
| `reports` | `/dashboard`, `/reports` | F16 | – | Read-only aggregate SQL across tables. The only module allowed to bypass "reads via another module's service". |
| `audit-logs` | `/audit-logs` | F17 | `audit_logs` (from F00) | Viewer only. The writer is `lib/audit.ts` inside each service's transaction. |

#### 1.6.3 Extra files that land per module

| File | Where it lives | Owner | Purpose | Rule |
|---|---|---|---|---|
| `subscriptions.state-machine.ts` | `modules/subscriptions/` | F09 | Allowed subscription transitions and guards. | Built on `lib/state-machine.ts`. |
| `invoices.state-machine.ts` | `modules/invoices/` | F11 | Allowed invoice transitions and guards. | Same. |
| `<module>.jobs.ts` | only in modules with scheduled jobs (currently `subscriptions`, `invoices`, `billing/`) | F10, F11, F12 | Plain exported job functions. | Registered by `jobs/index.ts`; not created if unused. |
| `<module>.emails.ts` | only in `auth` (F02) and `invoices` (F11) | F02, F11 | HTML/text email templates for this module. | Templates live here, not in `lib/mailer.ts`. |
| `<module>.service.test.ts` | next to the file | feature owner | Unit tests for pure logic (rules, state machines, money math). | Per [Directory Guidelines §J](../development/directory-guidelines.md). |

### 1.7 Database — `backend/db/`

| File | Status | Owner | Purpose |
|---|---|---|---|
| `backend/db/migrate.test.ts` | EXISTING | F00/F01 | Explicit feature scoping and strict unscoped migration failure regression tests. |

| Path | Status | Owner | Purpose | Notes |
|---|---|---|---|---|
| `schema.prisma` | SCAFFOLDED | F00 | Prisma schema — **only** if D-03 selects Prisma. | If D-03 lands on raw SQL, delete the file. Column-by-column must match [DB Design §4](../database/database-design.md). |
| `migrations/` | EXISTING | each feature | Timestamp-named SQL migrations; F00 baseline exists. | Never edit a merged migration; fix forward. |
| `migrations/20261031010000_f02_password_reset_tokens.sql` | EXISTING | F02 | Adds hashed single-use password reset tokens. | Forward-only. |
| `migrations/20261115000000_f06_products_and_variants.sql` | EXISTING | F06 | Adds products and product_variants. | |
| `migrations/20261108090000_f07_plans_and_policies.sql` | EXISTING | F07 | Adds plans and plan_products. | |
| `migrations/20261201000000_f11_invoices.sql` | EXISTING | F11 | Adds invoices, invoice_items, invoice_tax_details, billing_runs, invoice_number_seq. | |
| `migrations/20261231000000_f11_invoice_subscription_fks.sql` | EXISTING | F11 | Attaches FKs to F09 subscriptions when they exist. | |
| `seeds/reference/index.ts` | SCAFFOLDED | F00 | Idempotent seed: roles, first admin (from env per D-08), payment terms, sample taxes. | Safe to run in any environment. |
| `seeds/demo/index.ts` | SCAFFOLDED | F00 | Demo story data for walkthroughs. | Never in production. |
| `seeds/bulk/index.ts` | SCAFFOLDED | F00 | Bulk performance data (~5,000 subs / ~60,000 invoices) for the <2s criterion. | Used by S2 (Performance). |

### 1.8 Tests — `backend/tests/`

| Path | Status | Owner | Purpose |
|---|---|---|---|
| `health.test.ts` | **EXISTING** | F00 | Smoke test that `createApp()` responds to health checks. |
| `auth-forgery.test.ts` | EXISTING | F00 / F09 | Reject forged role and bearer credentials on protected integrated routes. |
| `setup.ts` | SCAFFOLDED | F00 | Apply migrations, truncate between test files, close the pool at the end. |
| `helpers/login-as.ts` | SCAFFOLDED | F00 | `loginAs(role)` — returns a supertest agent with a session cookie for a test user. |
| `helpers/clock.ts` | EXISTING | F00 | Injectable clock — needed by F10/F12 tests. |
| `factories/index.ts` | SCAFFOLDED | F00 | Base factory helpers (`createCustomer()`, `createActiveSubscription()`, …). Each table owner adds their own. |
| `integration/<module>/*.test.ts` | NOT SCAFFOLDED | feature owner | Per-endpoint integration tests (role matrix, validation, state errors). One file per feature per directory-guidelines §J. |

### 1.9 Deliberately NOT scaffolded in `backend/`

Per [Directory Guidelines §A.3](../development/directory-guidelines.md) — "unused optional files are simply not created":

- `<module>.jobs.ts` outside `subscriptions`, `invoices`, `billing/` — no scheduled jobs exist there.
- `<module>.emails.ts` outside `auth` (F02) and `invoices` (F11).
- `<module>.service.test.ts` for modules still unimplemented.
- Per-feature integration test files (created with the feature, not ahead of it).

---

## 2. Frontend — `frontend/`

### 2.1 Entry and existing files

| File | Status | Owner | Purpose |
|---|---|---|---|
| `src/main.tsx` | **EXISTING** | F00 | `createRoot` mount point. |
| `src/App.tsx` | **EXISTING** | F00 | App component — providers + router outlet. Replaced/extended by F00's shell. |
| `src/App.css` | **EXISTING** | F00 | Landing page styles. Move tokens into `src/styles/global.css` when the shell is built. |
| `src/index.css` | **EXISTING** | F00 | Global CSS reset. |
| `src/lib/api.ts` | **EXISTING** | F00 | **The single fetch wrapper** — base URL, `credentials: 'include'`, envelope unwrap, `ApiError`. Every `src/api/<module>.ts` imports from here. |

### 2.2 API clients — `frontend/src/api/`

Per-module API clients. Each imports `apiRequest` (and `ApiError`) from `../lib/api`.

| File | Status | Owner | Purpose |
|---|---|---|---|
| `auth.ts` | SCAFFOLDED | F01 | `register`, `login`, `logout`, `me`. F02 adds `forgot`, `reset`, `change`. |
| `users.ts` | SCAFFOLDED | F03 | Staff list/create/update. |
| `customers.ts` | SCAFFOLDED | F04 | Customer CRUD + `/me/profile`. |
| `products.ts` | SCAFFOLDED | F06 | Product + variant CRUD. |
| `plans.ts` | SCAFFOLDED | F07 | Plan CRUD + `PUT /plans/:id/products`. |
| `quotation-templates.ts` | SCAFFOLDED | F08 | Template CRUD. |
| `subscriptions.ts` | SCAFFOLDED | F09, F10 | Subscriptions and quotations — all create/transition/operations calls. |
| `taxes.ts` | SCAFFOLDED | F05 | Tax CRUD. |
| `payment-terms.ts` | SCAFFOLDED | F05 | Payment terms CRUD. |
| `discounts.ts` | SCAFFOLDED | F15 | Discount CRUD + grant/revoke. |
| `invoices.ts` | SCAFFOLDED | F11 | Invoice CRUD + confirm/cancel/send/print. |
| `billing-runs.ts` | IMPLEMENTED | F12 | Typed client for starting runs and reading run history/upcoming billing. |
| `billing-runs.ts` | EXISTING | F12 | `POST /billing/runs`, list, detail, upcoming. |
| `payments.ts` | SCAFFOLDED | F13 | Payment record/void/list. |
| `portal.ts` | SCAFFOLDED | F14 | `/me/subscriptions`, `/me/invoices` (+ print). |
| `reports.ts` | SCAFFOLDED | F16 | `/dashboard/summary` and every `/reports/*`. |
| `audit-logs.ts` | SCAFFOLDED | F17 | `GET /audit-logs`. |

> **Deliberately no `api/client.ts`.** The fetch wrapper is already `src/lib/api.ts` (existing). A `client.ts` re-export would create two canonical import paths for the same module. Move it once, in a follow-up PR, if the team decides to align with `directory-guidelines.md §G`.

### 2.3 Features — `frontend/src/features/`

Every feature folder has the **same 3 files**. The 3-file purpose table comes first, then the 16 features and their extra subdirs.

#### 2.3.1 The 3 files per feature (structural)

| File | Purpose | Rules |
|---|---|---|
| `index.ts` | **Public exports of the feature** — pickers, badges, and other components other features are allowed to use. | Nothing else is imported from outside. See [Directory Guidelines §B.2](../development/directory-guidelines.md). |
| `schemas.ts` | Zod form schemas — mirror the backend format rules for **friendly messages only**; the backend stays authoritative. | Never implement business rules here. |
| `types.ts` | TypeScript types that this feature consumes (records returned by the API, form-value shapes). | Keep in sync with `src/api/<module>.ts`. |

#### 2.3.2 The 16 features

| Feature folder | Owner | Extra files / subdirs it owns | Public surface (exported) |
|---|---|---|---|
| `auth` | F01, F02 | `pages/RegisterPage.tsx`, `pages/LoginPage.tsx` (F01); `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx` (F02); `components/PasswordField.tsx`, `components/AuthCard.tsx`; `hooks/useAuth.ts` (F01); `context/AuthProvider.tsx` (F01). | `useAuth`, `PasswordField`, `AuthCard`. |
| `users` | F03 | `pages/StaffListPage.tsx`; `components/StaffFormModal.tsx`; `hooks/useStaff.ts`. | – |
| `customers` | F04 | `pages/CustomerListPage.tsx`, `pages/CustomerFormPage.tsx`, `pages/CustomerDetailPage.tsx`; `components/CustomerSelect.tsx` (shared), `components/CustomerForm.tsx`, `components/CustomerProfileCard.tsx`, `components/CustomerDetailSections.tsx` (named slots for F09 subscriptions, F13 invoices and outstanding amounts); `hooks/useCustomers.ts`, `hooks/useDebouncedValue.ts`; `customers.css`, `__tests__/`. The portal `ProfilePage` is `portal/pages/ProfilePage.tsx` (F04; F14 adds the rest of the portal). | `CustomerSelect`. |
| `products` | F06 | ✅ **IMPLEMENTED.** `pages/ProductListPage.tsx`, `pages/ProductDetailPage.tsx`, `pages/ProductFormPage.tsx`; `components/VariantsPanel.tsx`, `components/ProductSelect.tsx`, `components/VariantSelect.tsx`. | `ProductSelect`, `VariantSelect`. |
| `plans` | F07 | `pages/PlanListPage.tsx`, `pages/PlanFormPage.tsx`, `pages/PlanDetailPage.tsx`; `routes/PlanListRoute.tsx`; `components/PlanProductsEditor.tsx`, `components/PlanSelect.tsx`, `components/PolicyToggles.tsx`, `components/product-slots.tsx` (TEMPORARY stand-ins for F06 `ProductSelect`/`VariantSelect` and F00 `MoneyInput`); `hooks/usePlans.ts`, `hooks/useUnsavedChangesGuard.ts`; `policies.ts`, `plans.css`; `__tests__/`. | `PlanSelect`. |
| `plans` | F07 | ✅ **IMPLEMENTED.** `pages/PlanListPage.tsx`, `pages/PlanFormPage.tsx`, `pages/PlanDetailPage.tsx`; `components/PlanProductsEditor.tsx`, `components/PlanSelect.tsx`, `components/PolicyToggles.tsx`, `components/product-slots.tsx` (TEMPORARY stand-ins for F06 `ProductSelect`/`VariantSelect` and F00 `MoneyInput`); `hooks/usePlans.ts`, `hooks/useUnsavedChangesGuard.ts`; `policies.ts`, `plans.css`; `__tests__/`. | `PlanSelect`. |
| `quotation-templates` | F08 | `pages/TemplateListPage.tsx`, `pages/TemplateFormPage.tsx`; `components/LineItemsEditor.tsx` (shared), `components/TemplateSelect.tsx`; `hooks/useTemplates.ts`. | `LineItemsEditor`, `TemplateSelect`. |
| `subscriptions` | F09, F10 | `pages/QuotationListPage.tsx`, `pages/SubscriptionListPage.tsx`, `pages/SubscriptionDetailPage.tsx`; `components/StatusTimeline.tsx`, `components/SubscriptionStatusBadge.tsx`, `components/SubscriptionActions.tsx`; `hooks/useSubscriptions.ts`, `hooks/useQuotations.ts`. | `SubscriptionStatusBadge`. |
| `taxes` | F05 | ✅ **IMPLEMENTED.** `pages/TaxListPage.tsx`; `components/TaxSelect.tsx`; `hooks/useTaxes.ts`. | `TaxSelect`. |
| `payment-terms` | F05 | ✅ **IMPLEMENTED.** `pages/PaymentTermListPage.tsx`; `components/PaymentTermSelect.tsx`; `hooks/usePaymentTerms.ts`. | `PaymentTermSelect`. |
| `discounts` | F15 | `pages/DiscountListPage.tsx`, `pages/DiscountDetailPage.tsx`; `components/DiscountsPanel.tsx`; `hooks/useDiscounts.ts`. | – |
| `invoices` | F11 | `pages/InvoiceListPage.tsx`, `pages/InvoiceDetailPage.tsx`, `pages/InvoicePrintPage.tsx`; `components/PaymentStateBadge.tsx`, `components/InvoiceDocument.tsx`; `hooks/useInvoices.ts`. | `PaymentStateBadge`, `InvoiceDocument`. |
| `billing-runs` | F12 | `pages/BillingRunPage.tsx`; `billing-runs.css`; run history, upcoming-billing summary and admin run-now action. | `BillingRunPage`. |
| `invoices` | F11 | ✅ **IMPLEMENTED.** `pages/InvoiceListPage.tsx`, `pages/InvoiceDetailPage.tsx`, `pages/InvoicePrintPage.tsx`; `components/PaymentStateBadge.tsx`, `components/InvoiceDocument.tsx`; `hooks/useInvoices.ts`. | `PaymentStateBadge`, `InvoiceDocument`. |
| `billing-runs` | F12 | ✅ **IMPLEMENTED.** `pages/BillingPage.tsx`, `pages/BillingRunDetailPage.tsx`; `components/RunBillingButton.tsx`; `hooks/useBillingRuns.ts`. | – |
| `payments` | F13 | `pages/PaymentListPage.tsx`; `components/RecordPaymentDialog.tsx`, `components/AllocationEditor.tsx`; `hooks/usePayments.ts`. | – |
| `portal` | F14 | `pages/PortalHomePage.tsx`, `pages/MySubscriptionsPage.tsx`, `pages/MyInvoicesPage.tsx`; `components/`; `hooks/useMySubscriptions.ts`, `hooks/useMyInvoices.ts`. | – |
| `reports` | F16 | `pages/DashboardPage.tsx`; `components/KpiCard.tsx`, `components/DateRangePicker.tsx`; `hooks/useDashboard.ts`. | – |
| `audit-logs` | F17 | `pages/AuditLogPage.tsx`; `components/AuditDetailDrawer.tsx`; `hooks/useAuditLogs.ts`. | – |

#### 2.3.3 Extra files that land per feature

| File / dir | Where | Owner | Purpose | Rule |
|---|---|---|---|---|
| `pages/*.tsx` | `features/<f>/pages/` | feature owner | Route-level screens. | No data fetching directly — call `hooks/` which call `api/`. |
| `components/*.tsx` | `features/<f>/components/` | feature owner | Components used only inside the feature (or shared via `index.ts` if other features need them). | Domain-specific = stays here. |
| `hooks/*.ts` | `features/<f>/hooks/` | feature owner | React Query hooks (`useProducts`, `useInvoices`, …). | Query-key convention `[module, 'list'|'detail', params]`. |
| `context/AuthProvider.tsx` | `features/auth/` | F01 | Provides `useAuth` data and login/logout actions. | Mounted in `App.tsx`. |

### 2.4 Shared UI components — `frontend/src/components/ui/`

Domain-free, reusable components. No imports from `features/`, no API calls.

| File | Status | Owner | Purpose | Used by |
|---|---|---|---|---|
| `DataTable.tsx` | SCAFFOLDED | F00 | Sortable table with loading skeleton and empty state. | Every list screen. |
| `Pagination.tsx` | SCAFFOLDED | F00 | Page control bound to `page` / `page_size` query params. | Every list screen. |
| `FormField.tsx` | SCAFFOLDED | F00 | Labelled input wrapper with error message slot. | Every form. |
| `MoneyInput.tsx` | SCAFFOLDED | F00 | String-safe money input (keeps value as string, validates format). | F06, F07, F08, F09, F15. |
| `Money.tsx` | SCAFFOLDED | F00 | Display component for API money strings. | Everywhere money is shown. |
| `StatusBadge.tsx` | SCAFFOLDED | F00 | Generic colored status chip. | Base for feature badges. |
| `Modal.tsx` | SCAFFOLDED | F00 | Focus-trapped dialog primitive. | Every confirm/create modal. |
| `ConfirmDialog.tsx` | SCAFFOLDED | F00 | Modal wrapper with confirm/cancel. | Destructive actions. |
| `Toast.tsx` | SCAFFOLDED | F00 | Success/error toast surface. | All mutations. |
| `EmptyState.tsx` | SCAFFOLDED | F00 | "No data yet" placeholder. | Every list. |
| `ErrorState.tsx` | SCAFFOLDED | F00 | Error placeholder with retry. | Every data view. |

### 2.5 Hooks — `frontend/src/hooks/`

Generic hooks used by two or more features. Feature hooks live in `features/<f>/hooks/`.

| File | Status | Owner | Purpose |
|---|---|---|---|
| `useDebounce.ts` | SCAFFOLDED | F00 | Debounce a value; used by async selects (`CustomerSelect`, `ProductSelect`). |
| `useUrlFilters.ts` | SCAFFOLDED | F00 | Read/write filter + page state in the URL query string. |

### 2.6 Layouts — `frontend/src/layouts/`

| File | Status | Owner | Purpose |
|---|---|---|---|
| `AuthLayout.tsx` | SCAFFOLDED | F00 | Centered card layout for `/login`, `/register`, `/forgot-password`, `/reset-password`. |
| `BackOfficeLayout.tsx` | IMPLEMENTED | F00 | Shared paper-cut back-office shell, role-aware navigation, account context and nested route outlet for `/app/*`. |
| `PortalLayout.tsx` | IMPLEMENTED | F00 | Customer-facing paper-cut portal shell and nested outlet for `/portal/*`. |

### 2.7 Routing — `frontend/src/routes/`

| File | Status | Owner | Purpose | Rule |
|---|---|---|---|---|
| `index.tsx` | SCAFFOLDED | F00 | Full route table (`/app/*`, `/portal/*`, auth pages). | F00 pre-declares every route with a placeholder page; features replace only their own placeholder component. |
| `guards.tsx` | SCAFFOLDED | F01 | `RequireAuth`, `RequireRole` — 401 → `/login?next=…`; wrong role → `ForbiddenPage`. | – |
| `menu.ts` | SCAFFOLDED | F00 | Sidebar menu items with `roles: [...]`. | Visibility only — the backend enforces. |

### 2.8 Helpers — `frontend/src/lib/`

`src/lib/api.ts` already exists (fetch wrapper). The remaining helpers are pure functions.

| File | Status | Owner | Purpose |
|---|---|---|---|
| `api.ts` | **EXISTING** | F00 | The single fetch wrapper. Every `src/api/<module>.ts` imports from it. |
| `money.ts` | SCAFFOLDED | F00 | Display-only money formatting (₹1,560.00). Never parse to `Number` for arithmetic. |
| `dates.ts` | SCAFFOLDED | F00 | Display-only date formatting. Wire format stays `YYYY-MM-DD` / ISO-8601. |
| `format.ts` | SCAFFOLDED | F00 | Generic display helpers (capitalise, pluralise). |
| `constants.ts` | SCAFFOLDED | F00 | Cross-feature constants (role names, statuses). Mirrors `backend/src/lib/constants.ts`. |
| `apply-server-errors.ts` | SCAFFOLDED | F00 | Map `ApiError.details[]` to React Hook Form `setError` calls. |
| `error-messages.ts` | SCAFFOLDED | F00 | Map `ApiError.code` → friendly display messages. |

### 2.9 Config, styles, test, assets

| Path | Status | Owner | Purpose |
|---|---|---|---|
| `src/config/env.ts` | SCAFFOLDED | F00 | The **only** file that reads `import.meta.env`. `VITE_API_BASE_URL` and any future public config. |
| `src/styles/global.css` | SCAFFOLDED | F00 | Design tokens (colors, spacing, typography) and global resets. |
| `src/styles/print.css` | SCAFFOLDED | F11 | Print rules for `InvoicePrintPage`. |
| `src/test/setup.ts` | NOT SCAFFOLDED | F00 | Vitest + RTL setup (only if the team adopts RTL per D-07). |
| `src/test/render-with-providers.tsx` | NOT SCAFFOLDED | F00 | Shared render helper (query + auth + router wrappers). |
| `src/assets/.gitkeep` | SCAFFOLDED | – | Reserved for bundled images/icons imported by code. |

### 2.10 Deliberately NOT scaffolded in `frontend/`

- `src/api/client.ts` — the fetch wrapper already lives at `src/lib/api.ts`. Adding a second path would create two canonical imports; that decision goes through a follow-up PR if the team wants alignment.
- `src/features/<f>/pages/`, `components/`, `hooks/` for every feature — these are created per-feature as the owner starts; empty folders can't be committed and gitignored per guideline §A.3.
- `src/components/ui/index.ts` — the guidelines explicitly forbid barrel files in `components/ui/` subfolders, so imports go by file path.
- Test utilities in `src/test/` — only when the test runner is actually installed.

---

## 3. Root, docs, CI, Docker, and configuration

These existed before the scaffold and are not touched by it. Listed so nobody looks for them in `backend/` or `frontend/`.

| Path | Status | Purpose |
|---|---|---|
| `README.md` (root) | EXISTING | Project overview, team, doc index, quick-start. |
| `docker-compose.yml` (root) | EXISTING | `api` + `web` services; PostgreSQL and Mailpit come from `compose up` once the services are built. |
| `.env.example` (root) | EXISTING | Compose-only variables (`RUNTIME`, `API_PORT`, `WEB_PORT`, `ALLOWED_ORIGINS`). |
| `.gitignore`, `.editorconfig` | EXISTING | Per-repo ignore rules and editor defaults. |
| `.github/workflows/ci.yml` | EXISTING | Lint + typecheck + tests + build, Node.js and Bun, both Docker targets. |
| `.github/pull_request_template.md` | EXISTING | PR checklist (added by F00). |
| `docs/README.md` | EXISTING | Documentation index. |
| `docs/architecture/*.md` | EXISTING | System architecture, data flows, state machines, billing engine, security & RBAC, user-access-and-authorization (**D-01** — does not apply). |
| `docs/api/api-specification.md` | EXISTING | The API contract. Change a section before changing code. |
| `docs/database/database-design.md` | EXISTING | The schema source of truth. Change this before writing a migration. |
| `docs/development/*.md` | EXISTING | Roadmap, Git workflow, directory guidelines. |
| `docs/implementation/feature-breakdown.md` | EXISTING | Feature ownership, waves, Definition of Done. |
| `docs/implementation/file-index.md` | **NEW (this file)** | Per-file purpose and owner. Additive — does not change the docs above. |
| `backend/package.json`, `bun.lock`, `package-lock.json` | EXISTING | Backend dependencies. Add packages in a small dedicated PR. |
| `backend/tsconfig*.json`, `vitest.config.ts`, `.oxlintrc.json` | EXISTING | Backend tooling config. |
| `backend/Dockerfile`, `.dockerignore` | EXISTING | `node` and `bun` build targets. |
| `backend/.env.example` | EXISTING | Backend environment variables. Extend together with `src/config.ts`. |
| `frontend/package.json`, `bun.lock`, `package-lock.json` | EXISTING | Frontend dependencies. |
| `frontend/tsconfig*.json`, `vite.config.ts`, `.oxlintrc.json` | EXISTING | Frontend tooling config. |
| `frontend/Dockerfile`, `.dockerignore`, `nginx.conf` | EXISTING | Production build. `nginx.conf` proxies `/api/` to `api:4000`. |
| `frontend/index.html`, `public/favicon.svg` | EXISTING | SPA entry and static asset. |
| `frontend/.env.example` | EXISTING | `VITE_API_BASE_URL` and future public config. |

---

## 4. The rules the index assumes

The index respects these from the [Directory Guidelines](../development/directory-guidelines.md); changes to those rules first, then here.

1. **Module folders are owned** — one feature per module, cross-module edits go through the owner (§L.2).
2. **Modules talk through `index.ts` only** — never import another module's repository, controller, or schema (§C.2).
3. **Business rules live in services**, not in controllers or React (§C.1, §H.1).
4. **Money is a string end to end** — never a `Number` (§D, §G).
5. **State changes go through the state machine and write audit rows in the same transaction** (§C.4).
6. **Customer scope is derived from the session**, never from the request (§K, §4.1 of Security).
7. **Shared files change through a small PR + chat notice** (§L.2) — this file index does not create shared-file churn.

---

## 5. Progress tracking

The scaffold marks every placeholder with the literal token `PLACEHOLDER`. The count is your progress metric. **F03, F06, F11, and F12 are merged; their files no longer contain `PLACEHOLDER`.**

```bash
# Files still stubbed:
grep -rl PLACEHOLDER backend/src frontend/src | wc -l

# Files stubbed per area:
grep -rl PLACEHOLDER backend/src             | wc -l
grep -rl PLACEHOLDER backend/src/billing     | wc -l
grep -rl PLACEHOLDER backend/src/modules     | wc -l
grep -rl PLACEHOLDER frontend/src            | wc -l
grep -rl PLACEHOLDER frontend/src/features   | wc -l
grep -rl PLACEHOLDER frontend/src/components | wc -l
```
