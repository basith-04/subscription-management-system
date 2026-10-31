# API Specification (Contract Draft)

> **Status:** Draft contract. **F06 (Products & variants) endpoints are implemented.** Other endpoints are not implemented yet. The frontend and backend developers should agree on this document first and change it through a pull request when the contract changes.
> Related: [Database Design](../database/database-design.md) · [State Machines](../architecture/state-machines.md) · [Billing Engine](../architecture/billing-engine.md) · [Security & RBAC](../architecture/security-and-rbac.md)

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `/api/v1` (e.g. `http://localhost:4000/api/v1`) |
| Format | JSON (`Content-Type: application/json`); UTF-8 |
| Auth | `httpOnly` session cookie set by `POST /auth/login`. No token in JS-accessible storage. CSRF: `SameSite=Lax` cookie + `Origin` check on non-GET requests |
| Roles in tables | **A** Admin · **S** Staff · **C** Customer (own data only) · **P** Public (no login) · **Any** any logged-in user |
| URL style | plural nouns, `kebab-case`, actions as `POST /resource/:id/action` for state changes |
| Methods | `GET` read · `POST` create/action · `PATCH` partial update · `PUT` replace a child collection · `DELETE` remove (only where safe) |
| IDs | numeric (`"id": 42`) |
| Money | **strings** with 2 decimals: `"1560.00"`. Rates: `"18.000"`. Never JSON numbers |
| Dates | `YYYY-MM-DD` for dates; ISO-8601 UTC for timestamps |
| Soft delete | Financial/master data is deactivated (`is_active`), not deleted |

**Where this contract is implemented (PLANNED):** request schemas in `backend/src/modules/<module>/<module>.schemas.js`, business rules in `<module>.service.js`, responses only through `backend/src/lib/responses.js`, error codes from `backend/src/lib/error-codes.js` (which must match the table in §1.2). Frontend calls live in `frontend/src/api/<module>.js`. The `/quotations` endpoints (§7.2) and `/subscriptions` endpoints (§8) are served by the **same** `subscriptions` module. See [Directory Guidelines §G](../development/directory-guidelines.md).

### 1.1 Success envelope
```json
{ "data": { ... } }                         // single resource
{ "data": [ ... ], "meta": { "page": 1, "page_size": 20, "total": 134, "total_pages": 7 } }   // list
```
Create → `201` (+ `Location` header). Action endpoints → `200` with the updated resource. Delete → `204`.

### 1.2 Error envelope
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input",
             "details": [ { "field": "password", "message": "Must contain an uppercase letter" } ],
             "request_id": "b1f4…" } }
```

| HTTP | `code` examples | When |
|---|---|---|
| 400 | `BAD_REQUEST`, `MALFORMED_JSON` | cannot parse request |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED` | not logged in / bad login |
| 403 | `FORBIDDEN`, `PLAN_POLICY_FORBIDS` | role not allowed, or plan policy forbids the action |
| 404 | `NOT_FOUND` | no such resource **or not yours** (customers) |
| 409 | `CONFLICT`, `EMAIL_ALREADY_EXISTS`, `INVALID_STATE_TRANSITION`, `DUPLICATE_PAYMENT_REFERENCE`, `PERIOD_ALREADY_INVOICED`, `IN_USE` | uniqueness, state, or dependency conflict |
| 422 | `VALIDATION_ERROR`, `PLAN_NOT_AVAILABLE`, `ALLOCATION_EXCEEDS_AMOUNT_DUE`, `QUANTITY_BELOW_MINIMUM` | valid JSON, invalid values or business rule |
| 429 | `RATE_LIMITED` | too many requests (login, reset) |
| 500 | `INTERNAL_ERROR` | bug; message is generic, details only in server logs |

The "Common errors" column below lists only what is *specific*; **every** endpoint can also return 401, 403 (role), 422 (validation) and 500.

### 1.3 Pagination, sorting, filtering, search (all list endpoints)

| Query param | Meaning | Example |
|---|---|---|
| `page` | 1-based page (default 1) | `page=2` |
| `page_size` | default 20, **max 100** | `page_size=50` |
| `sort` | comma list; `-` prefix = descending; only whitelisted fields | `sort=-created_at,number` |
| `q` | free-text search over documented fields | `q=acme` |
| other | resource-specific filters (see each section); ranges use `_from` / `_to` | `status=active&expiry_to=2026-12-31` |

Large tables (invoices, payments, audit logs) may additionally support `cursor` pagination later. `meta.total` uses a count with the same filters (indexes noted in the DB doc). Unknown filter or sort fields → `422`.

### 1.4 Computed fields on resources
- Subscription: `display_status` (`Active (Paused)`), `days_to_expiry`, `can_pause`, `can_renew`, `can_close` (from plan policies + state, for the UI).
- Invoice: `payment_state` = `draft | not_due | outstanding | partially_paid | overdue | paid | cancelled`.

---

## 2. Authentication

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| POST | `/auth/register` | Customer self-registration (creates user + customer profile, logs in) | P | `{ full_name, email, password, company_name?, phone? }` | `201` `{ data: { user: {id, email, full_name, role}, customer_id } }` + cookie | email valid, trimmed/lowercased, unique; password **length > 8**, ≥1 upper, ≥1 lower, ≥1 special; name 1–120 chars | 409 `EMAIL_ALREADY_EXISTS` |
| POST | `/auth/login` | Log in | P | `{ email, password }` | `200` user object + cookie | both present | 401 `INVALID_CREDENTIALS` (same message for wrong email or password); 403 if account disabled; 429 |
| POST | `/auth/logout` | Clear cookie | Any | — | `204` | — | — |
| GET | `/auth/me` | Current user, role, permissions | Any | — | `{ data: { id, email, full_name, role, customer_id? } }` | — | 401 |
| POST | `/auth/forgot-password` | Email a reset link | P | `{ email }` | `200` always `{ data: { message } }` (never reveals if the email exists) | email format | 429 |
| POST | `/auth/reset-password` | Set a new password using the emailed token | P | `{ token, new_password }` | `200` | token valid, unexpired, unused; password rules as above | 400 `INVALID_OR_EXPIRED_TOKEN` |
| POST | `/auth/change-password` | Change own password | Any | `{ current_password, new_password }` | `200` | current password correct; new ≠ current; rules | 401/422 |

---

## 3. User management (staff accounts)

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| POST | `/users/staff` | Create a staff account (**Admin only**) | A | `{ full_name, email, password }` (OPEN QUESTION: or invite by email) | `201` user (no hash) | same password rules; email unique | 403 for Staff/Customer; 409 `EMAIL_ALREADY_EXISTS` |
| GET | `/users` | List staff/admin users | A | filters: `role`, `is_active`, `q` | list | — | — |
| GET | `/users/:id` | User detail | A | — | user | — | 404 |
| PATCH | `/users/:id` | Update name, activate/deactivate | A | `{ full_name?, is_active? }` | user | cannot deactivate yourself or the last admin | 409 |

Role changes are not exposed (an Admin cannot promote via API in v1; OPEN QUESTION).

---

## 4. Customers

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/customers` | List customers | A, S | filters: `q` (name/email/company), `is_active`; sort: `name`, `created_at` | list: `{id, name, company_name, email, phone, is_active, active_subscriptions_count?}` | — | — |
| POST | `/customers` | Create a customer record (without portal login) | A, S | `{ name, company_name?, email, phone?, address{…}, tax_id?, notes? }` | `201` customer | name required; email valid; address field lengths | — |
| GET | `/customers/:id` | Customer detail incl. subscription and invoice summary | A, S | — | customer + `{ subscriptions_count, outstanding_amount, overdue_amount }` | — | 404 |
| PATCH | `/customers/:id` | Update customer | A, S | any subset of create fields + `is_active` (deactivate: **A** only) | customer | as create | 403 |
| GET | `/me/profile` | Own profile | C | — | customer | — | — |
| PATCH | `/me/profile` | Update own contact/address | C | `{ name?, company_name?, phone?, address? }` (not `email`, not `is_active`) | customer | as create | — |

Changing a customer address does not change issued invoices (snapshots).

---

## 5. Products

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/products` | List products | A, S | filters: `q`, `product_type`, `is_active`; sort: `name`, `sales_price`, `created_at` | list with variants count | — | — |
| POST | `/products` | Create product | A | `{ name, product_type, sales_price, cost_price, notes? }` | `201` product | name 1–150 unique; type in allowed list; prices `≥ 0`, 2 decimals max | 409 duplicate name |
| GET | `/products/:id` | Product + variants | A, S | — | product with `variants[]` | — | 404 |
| PATCH | `/products/:id` | Update product (incl. `is_active`) | A | any subset | product | as create | 409 |
| DELETE | `/products/:id` | Delete a product that was never used | A | — | `204` | — | 409 `IN_USE` (use `is_active=false`) |

### 5.1 Product variants

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/products/:productId/variants` | List variants | A, S | — | list `{id, attribute_name, attribute_value, price_adjustment, effective_price}` | — | 404 |
| POST | `/products/:productId/variants` | Add variant (e.g. Brand=Odoo +560) | A | `{ attribute_name, attribute_value, price_adjustment }` e.g. `"560.00"` | `201` variant (with `effective_price: "<sales_price + adjustment>"`) | unique per product; adjustment may be negative but `effective_price ≥ 0` | 409 duplicate |
| PATCH | `/variants/:id` | Update variant | A | subset incl. `is_active` | variant | as above | 404 |
| DELETE | `/variants/:id` | Remove unused variant | A | — | `204` | — | 409 `IN_USE` |

Example response:
```json
{ "data": { "id": 7, "product_id": 3, "attribute_name": "Brand", "attribute_value": "Odoo",
            "price_adjustment": "560.00", "effective_price": "1560.00", "is_active": true } }
```

---

## 6. Plans

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/plans` | List plans | A, S (C: only plans of own subscriptions via subscription detail) | filters: `q`, `billing_frequency`, `is_active`, `available_on=YYYY-MM-DD` | list | — | — |
| POST | `/plans` | Create plan with policies | A | `{ name, price, billing_frequency, min_quantity, available_from, available_to?, auto_close_on_end, allow_early_close, allow_pause, allow_renewal, notes? }` | `201` plan | frequency ∈ daily/weekly/monthly/yearly; `min_quantity ≥ 1`; `available_to ≥ available_from`; booleans required | 409 duplicate name |
| GET | `/plans/:id` | Plan with products | A, S | — | plan + `products[]` | — | 404 |
| PATCH | `/plans/:id` | Update plan / policies | A | subset | plan | as create. Policy changes apply to **future actions**; they do not change existing subscription states | — |
| PUT | `/plans/:id/products` | Replace the plan's product list | A | `{ products: [{ product_id, variant_id?, default_quantity, unit_price_override? }] }` | `200` list | products exist & active; variant belongs to product; no duplicates | 422 |
| DELETE | `/plans/:id` | Delete unused plan | A | — | `204` | — | 409 `IN_USE` |

**Implementation notes (F07)**
- Access: Admin read + write; Staff read-only; Customers have **no** access to `/plans*` (403 `FORBIDDEN`) — plan info reaches them only through their own subscription (F14).
- `GET /plans` accepts only `q` (name contains), `billing_frequency`, `is_active` (`true|false`), `available_on` (`YYYY-MM-DD`), `page`, `page_size`, `sort` (`name`, `price`, `available_from`, `created_at`; default `name`). Anything else → `422`. `available_on=D` returns plans with `is_active = true`, `available_from <= D` and (`available_to` is null or `available_to >= D`); both bounds are inclusive.
- Request bodies use **flat** policy booleans (`auto_close_on_end`, `allow_early_close`, `allow_pause`, `allow_renewal`); all four are required on `POST`. `min_quantity` defaults to 1, `available_to` to `null` (open-ended), `is_active` to `true`. `price` is a money string (`"499.00"`).
- `PATCH` validates the date range against the stored values (sending only `available_to` is checked against the stored `available_from`). Policy, `available_to` and `min_quantity` changes never modify existing subscriptions: policies are checked at action time (F10), a past `available_to` only blocks new sales (F09 via `assertPlanAvailable`), and a higher `min_quantity` applies to new/edited lines only.
- `PUT /plans/:id/products` replaces the whole list in **one transaction** (any failure leaves the previous list intact). Each product must exist and be active; a variant must exist, be active and belong to the row's product; `(product_id, variant_id)` must be unique (two rows without a variant are duplicates). Violations → `422 VALIDATION_ERROR` with `details[]` (`products.<index>.<field>`). Products that become inactive *after* being attached stay on the plan and are returned with `product_is_active: false`.
- Errors: `404 NOT_FOUND` (missing plan), `409 CONFLICT` (duplicate name), `409 IN_USE` (plan referenced by subscriptions/templates — FK `RESTRICT`; deactivate with `is_active=false` instead), `422 VALIDATION_ERROR`, `403 FORBIDDEN`.

**Plan response shape (consumed by F09, F10, F14 — do not vary per endpoint)**

Every plans endpoint returns the same plan object; `GET /plans/:id`, `POST` and `PATCH` add `products[]`, list rows add `product_count`.

```json
{ "data": {
    "id": 3, "name": "Monthly Pro", "price": "499.00", "billing_frequency": "monthly",
    "min_quantity": 1, "available_from": "2026-01-01", "available_to": null, "is_active": true,
    "notes": null,
    "policies": { "auto_close_on_end": true, "allow_early_close": false, "allow_pause": true, "allow_renewal": true },
    "created_at": "2026-11-08T09:00:00.000Z", "updated_at": "2026-11-08T09:00:00.000Z",
    "products": [
      { "id": 11, "product_id": 9, "product_name": "CRM", "product_is_active": true,
        "variant_id": 7, "variant_label": "Brand: Odoo", "variant_is_active": true,
        "default_quantity": 2, "unit_price_override": "10.50" } ] } }
```

| `policies` field | Meaning (checked **at action time**, never stored on subscriptions) | Read by |
|---|---|---|
| `auto_close_on_end` | Subscription is closed automatically when it reaches `expiry_date` | F10 expiry job |
| `allow_early_close` | `active → closed` before expiry is permitted (Admin may override, audited) | F10 `close` |
| `allow_pause` | Subscription may be paused | F10 `pause` |
| `allow_renewal` | Subscription may be renewed | F10 `renew` |

`PUT /plans/:id/products` responds `200 { "data": [ <plan product>, … ] }` using the `products[]` element shape above. Other modules should call `assertPlanAvailable(plan, startDate)` (exported from `modules/plans/index.ts`; `422 PLAN_NOT_AVAILABLE` when the plan is inactive or `startDate` is outside the inclusive availability window) rather than re-implementing the rule.

---

## 7. Quotation templates and quotations

### 7.1 Quotation templates
| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/quotation-templates` | List | A, S | `q`, `is_active` | list | — | — |
| POST | `/quotation-templates` | Create template | A | `{ name, plan_id, validity_days, payment_term_id?, notes?, items: [{ product_id, variant_id?, quantity, unit_price_override?, tax_rule_id? }] }` | `201` | plan active; `validity_days > 0`; ≥1 item; quantity > 0 | 409 duplicate name |
| GET | `/quotation-templates/:id` | Detail | A, S | — | template + items | — | 404 |
| PATCH | `/quotation-templates/:id` | Update (replaces `items` if provided) | A | subset | template | as create | — |
| DELETE | `/quotation-templates/:id` | Delete (existing quotations unaffected: lines were copied) | A | — | `204` | — | — |

### 7.2 Quotations
A quotation is a subscription in `draft`/`quotation` status. These endpoints are convenient aliases for sales reps and use the subscription service ([State Machines](../architecture/state-machines.md)).

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/quotations` | List quotations (subscriptions in draft/quotation) | A, S | `status`, `customer_id`, `q`, `valid_until_to` | list | — | — |
| POST | `/quotations` | Create from a template or from scratch (status `draft`, number assigned) | A, S | `{ customer_id, template_id?, plan_id?, start_date, expiry_date, payment_term_id?, items?: [...] }` (`template_id` or `plan_id` required; items default from the template) | `201` quotation with computed `totals` | customer exists; plan active and available on `start_date`; quantity ≥ plan `min_quantity`; `expiry_date ≥ start_date` | 422 `PLAN_NOT_AVAILABLE`, `QUANTITY_BELOW_MINIMUM` |
| GET | `/quotations/:id` | Detail with lines and totals | A, S | — | quotation | — | 404 |
| PATCH | `/quotations/:id` | Edit header/lines | A, S | subset; `items` replaces the line list | quotation | only in `draft`/`quotation` | 409 `INVALID_STATE_TRANSITION` |
| POST | `/quotations/:id/issue` | `draft → quotation`; sets validity | A, S | `{ valid_until? }` (default from template) | quotation | ≥ 1 line; valid_until ≥ today | 409 |
| POST | `/quotations/:id/confirm` | `quotation → confirmed` | A, S; C (own quote) | — | subscription | today ≤ `quotation_valid_until` | 409 `QUOTATION_EXPIRED` |
| POST | `/quotations/:id/cancel` | Cancel (`→ closed`, reason `cancelled`) | A, S | `{ reason? }` | subscription | draft/quotation/confirmed only | 409 |

---

## 8. Subscriptions

Staff/Admin see all. A customer sees only their own through `/me/subscriptions` (and the action endpoints below are ownership-checked).

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/subscriptions` | List/search subscriptions | A, S | filters: `status`, `customer_id`, `plan_id`, `paused=true\|false`, `billing_frequency`, `expiry_from/_to`, `next_billing_to`, `q` (number/customer); sort: `number`, `start_date`, `expiry_date`, `next_billing_date`, `created_at` | list `{id, number, customer{id,name}, plan{id,name}, status, display_status, start_date, expiry_date, next_billing_date, total_per_period}` | — | — |
| GET | `/subscriptions/:id` | Detail: header, lines, discounts, flags, policy-derived `can_*` | A, S | — | subscription | — | 404 |
| POST | `/subscriptions` | Create directly as `draft` (same body as `POST /quotations`) | A, S | as quotations | `201` | as quotations | 422 |
| PATCH | `/subscriptions/:id` | Edit header/lines | A, S | subset | subscription | draft/quotation: all fields; active: lines/price changes apply to **future** invoices only (OPEN QUESTION), `plan_id`/`start_date` locked | 409 |
| POST | `/subscriptions/:id/activate` | `confirmed → active` (normally automatic) | A, S | — | subscription | today ≥ `start_date` (A may override with `{ force: true }`) | 409 |
| POST | `/subscriptions/:id/pause` | Pause (flag) | A, S, C(own) | `{ reason? }` | subscription | `active`, not already paused, **`plan.allow_pause`** | 403 `PLAN_POLICY_FORBIDS`; 409 |
| POST | `/subscriptions/:id/resume` | Resume | A, S, C(own) | — | subscription | currently paused | 409 |
| POST | `/subscriptions/:id/renew` | Extend expiry by one term | A, S, C(own) | `{ terms?: 1 }` | subscription | `active`, **`plan.allow_renewal`**, plan active | 403 `PLAN_POLICY_FORBIDS`; 409 |
| POST | `/subscriptions/:id/close` | Early closure (`active → closed`) | A, S, C(own) | `{ reason?, effective_date? }` | subscription | `active`; **`plan.allow_early_close`** (Admin may override with `{ override: true }`, audited) | 403 `PLAN_POLICY_FORBIDS` |
| GET | `/subscriptions/:id/invoices` | Billing history for the subscription | A, S | paging, `status` | list of invoices | — | 404 |
| GET | `/subscriptions/:id/history` | Status changes (from audit log) | A, S | — | list | — | — |
| POST | `/subscriptions/:id/discounts` | Grant an existing discount to this subscription | A, S | `{ discount_id }` | `201` | discount active; not already granted | 409 |
| DELETE | `/subscriptions/:id/discounts/:discountId` | Revoke a grant | A, S | — | `204` | — | — |
| GET | `/me/subscriptions` | My subscriptions | C | `status`, paging | list | scoped by session `customer_id` | — |
| GET | `/me/subscriptions/:id` | My subscription detail | C | — | subscription (no costs/internal notes) | — | 404 if not mine |

---

## 9. Taxes and payment terms

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/taxes` | List tax rules | A, S | `is_active` | list | — | — |
| POST | `/taxes` | Create tax rule | A | `{ name, rate }` (`"18.000"`) | `201` | name unique; `0 ≤ rate ≤ 100` | 409 |
| PATCH | `/taxes/:id` | Update name/rate/`is_active` | A | subset | tax | as create. **Existing invoices keep their snapshot**; only future invoices use the new rate | — |
| DELETE | `/taxes/:id` | Delete unused tax | A | — | `204` | — | 409 `IN_USE` |
| GET | `/payment-terms` | List terms | A, S | — | list | — | — |
| POST / PATCH | `/payment-terms`, `/payment-terms/:id` | Create / update (`name`, `due_days`, `is_active`) | A | body | term | `due_days ≥ 0` | 409 |

---

## 10. Discounts

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/discounts` | List discounts with usage | A, S | `is_active`, `status=current\|expired\|exhausted\|upcoming`, `q` | list `{…, used_count, max_uses}` | — | — |
| POST | `/discounts` | Create discount rule (**Admin only**) | A | `{ name, discount_type: "fixed"\|"percentage", value, scope: "products"\|"subscription", product_ids?, min_purchase_amount?, min_quantity?, start_date, end_date?, max_uses? }` | `201` | `value > 0`; percentage ≤ 100; `end_date ≥ start_date`; `max_uses ≥ 1`; scope=products ⇒ `product_ids` non-empty & products exist; scope=subscription ⇒ no `product_ids` | 403 for Staff |
| GET | `/discounts/:id` | Detail | A, S | — | discount + product list | — | 404 |
| PATCH | `/discounts/:id` | Update / deactivate (**Admin only**) | A | subset | discount | `max_uses ≥ used_count`; past invoices unaffected | — |
| GET | `/discounts/:id/redemptions` | Where it was used | A, S | paging | list `{invoice_number, subscription_number, amount, date}` | — | — |

Granting to subscriptions: see §8 (`POST /subscriptions/:id/discounts`).

---

## 11. Invoices

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/invoices` | List invoices | A, S | filters: `status`, `payment_state`, `customer_id`, `subscription_id`, `issue_from/_to`, `due_from/_to`, `q` (number/customer), `min_total`/`max_total`; sort: `issue_date`, `due_date`, `total`, `number` | list `{id, number, customer, status, payment_state, issue_date, due_date, total, amount_paid, amount_due}` + optional `meta.summary` totals for the filter | — | — |
| GET | `/invoices/:id` | Detail with lines, tax summary, payments | A, S | — | invoice | — | 404 |
| POST | `/invoices` | Create a draft manually for a subscription period (e.g. re-issue after cancellation) | A, S | `{ subscription_id, period_start }` (engine fills the rest) | `201` | subscription active; `period_start` must be a valid period boundary | 409 `PERIOD_ALREADY_INVOICED` |
| PATCH | `/invoices/:id` | Edit a **draft** (due date, notes, remove a line before confirm) | A, S | subset | invoice | status = draft | 409 |
| POST | `/invoices/:id/confirm` | `draft → confirmed` | A, S | — | invoice | totals consistent; ≥1 line | 409 |
| POST | `/invoices/bulk-confirm` | Confirm many drafts (e.g. a billing run) | A, S | `{ invoice_ids?: [..], billing_run_id? }` | `200` `{ confirmed, failed: [{id, code}] }` | ≤ 500 ids | — |
| POST | `/invoices/:id/cancel` | Cancel | A, S | `{ reason }` | invoice | reason required; if confirmed: no payments allocated (else void payment first) | 409 |
| POST | `/invoices/:id/send` | Email invoice to the customer (confirmed or paid) | A, S | `{ to?: email, message? }` | `200` with `sent_at` | not draft/cancelled; valid email | 502 `EMAIL_FAILED` (invoice unchanged) |
| GET | `/invoices/:id/print` | Print-ready HTML (or PDF if added) | A, S | `?format=html\|pdf` | HTML/PDF | — | 404 |
| GET | `/invoices/:id/payments` | Payments allocated to this invoice | A, S | — | list | — | — |
| GET | `/me/invoices` | My invoices (never drafts) | C | `payment_state`, `status`, paging | list | scoped | — |
| GET | `/me/invoices/:id` | My invoice detail | C | — | invoice | — | 404 if not mine |
| GET | `/me/invoices/:id/print` | Printable version of my invoice | C | — | HTML | — | 404 |

### 11.1 Billing runs

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| POST | `/billing/runs` | Run billing now (same function the scheduler calls) | A | `{ as_of?: "YYYY-MM-DD" }` default today; `as_of` ≤ today + 0 | `202` `{ data: { run_id, status: "running" } }` | `as_of` not in the future | 409 if a run is already `running` and recent |
| GET | `/billing/runs` | List runs | A, S | paging | list with counts | — | — |
| GET | `/billing/runs/:id` | Run detail incl. errors | A, S | — | run + `errors[]` | — | 404 |
| GET | `/billing/upcoming` | Subscriptions due in the next N days | A, S | `days=7` | list | `days` 1–90 | — |

Example invoice detail:
```json
{ "data": {
  "id": 812, "number": "INV-000812", "status": "confirmed", "payment_state": "partially_paid",
  "subscription": { "id": 55, "number": "SUB-000055" },
  "customer": { "id": 9, "name": "Acme Traders", "email": "acct@acme.test" },
  "period_start": "2026-11-01", "period_end": "2026-11-30",
  "issue_date": "2026-11-01", "due_date": "2026-11-16", "payment_term": "Net 15",
  "items": [ { "description": "Platform – Brand: Odoo", "quantity": 5, "unit_price": "1560.00",
               "line_subtotal": "7800.00", "discount_amount": "780.00", "taxable_amount": "7020.00",
               "tax_name": "GST 18%", "tax_rate": "18.000", "tax_amount": "1263.60", "line_total": "8283.60" } ],
  "tax_details": [ { "tax_name": "GST 18%", "tax_rate": "18.000", "taxable_amount": "7020.00", "tax_amount": "1263.60" } ],
  "subtotal": "7800.00", "discount_total": "780.00", "tax_total": "1263.60", "total": "8283.60",
  "amount_paid": "3000.00", "amount_due": "5283.60" } }
```

---

## 12. Payments

| Method | URL | Purpose | Role | Request body | Response | Validation | Specific errors |
|---|---|---|---|---|---|---|---|
| GET | `/payments` | List payments | A, S | filters: `method`, `customer_id`, `invoice_id`, `date_from/_to`, `voided=false`, `q` (reference/customer); sort: `payment_date`, `amount` | list `{id, customer, method, amount, payment_date, note, reference_number, allocations[]}` | — | — |
| POST | `/payments` | Record a payment and allocate it to invoice(s) | A, S | `{ method, amount: "5283.60", payment_date, note?, reference_number?, allocations: [{ invoice_id, amount }] }` — header `Idempotency-Key` optional | `201` payment + updated invoices `{id, amount_paid, amount_due, status}` | method in allowed list; `amount > 0`, ≤ 2 decimals; `payment_date` ≤ today; ≥1 allocation; `Σ allocations ≤ amount`; each allocation `≤ invoice.amount_due`; all invoices `confirmed` and of the **same customer** | 409 `DUPLICATE_PAYMENT_REFERENCE`, `INVALID_STATE_TRANSITION`; 422 `ALLOCATION_EXCEEDS_AMOUNT_DUE` |
| GET | `/payments/:id` | Detail with allocations | A, S | — | payment | — | 404 |
| POST | `/payments/:id/void` | Void a mistaken payment | A | `{ reason }` | payment (voided) + affected invoices | reason required; not already voided | 409 |

There is no `DELETE /payments/:id` and no `PATCH` of amounts: correct mistakes by voiding and re-entering. Gateway payments, if ever added, would arrive via a separate webhook route and are **out of scope** here.

---

## 13. Dashboard and reports

All role **A, S** (finance lead is a Staff account). Every endpoint accepts `date_from`, `date_to` (default: current month) unless stated. Aggregation happens in SQL; responses are small and are designed to render in < 2 s with thousands of subscriptions.

| Method | URL | Purpose | Extra filters | Response |
|---|---|---|---|---|
| GET | `/dashboard/summary` | Headline numbers | `date_from/_to` | `{ active_subscriptions, paused_subscriptions, new_subscriptions, closed_subscriptions, revenue_received: "…", invoiced_amount: "…", outstanding_amount: "…", overdue_amount: "…", overdue_invoices_count, draft_invoices_count, upcoming_billing_7d_count }` |
| GET | `/reports/revenue` | Cash received over time | `group_by=day\|week\|month`, `method`, `customer_id` | `{ series: [{period, amount}], total }` |
| GET | `/reports/subscriptions` | Subscription counts/status breakdown | `status`, `plan_id`, `billing_frequency`, `group_by=status\|plan\|frequency` | `{ rows: [{key, count}], total }` + optional recurring-revenue estimate (OPEN QUESTION: MRR definition) |
| GET | `/reports/invoices` | Invoice summary by `payment_state`/status | `status`, `payment_state`, `customer_id` | `{ rows: [{payment_state, count, amount}] }` |
| GET | `/reports/overdue` | Overdue invoices (oldest first), paginated | `min_days_overdue`, `customer_id`, paging | list `{invoice, days_overdue, amount_due}` + `meta.summary.total_overdue` |
| GET | `/reports/outstanding-by-customer` | Who owes what | paging, `sort=-amount_due` | list `{customer, outstanding, overdue, oldest_due_date}` |
| GET | `/reports/payments` | Payment listing and method breakdown | `method`, `group_by=method` | `{ rows, total }` |
| GET | `/audit-logs` | Audit trail (**Admin only**) | `entity_type`, `entity_id`, `actor_user_id`, `action`, `date_from/_to`, paging | list |

Exporting to CSV (`?format=csv`) is a possible extra; OPEN QUESTION.

---

## 14. Endpoint-to-role quick matrix

| Area | Admin | Staff | Customer |
|---|---|---|---|
| Auth (register/login/reset) | ✔ | ✔ | ✔ |
| Create staff | ✔ | ✘ | ✘ |
| Customers (CRUD) | ✔ | ✔ (no deactivate) | own profile only |
| Products, variants, plans, templates, taxes, payment terms | ✔ write | read | ✘ |
| Discounts | ✔ create/edit | read; may grant to subscriptions | ✘ |
| Quotations / subscriptions | ✔ | ✔ | own, plan-permitted actions |
| Invoices (create, confirm, cancel, send, print) | ✔ | ✔ | own view/print (non-draft) |
| Payments (record) | ✔ | ✔ | ✘ |
| Payments (void) | ✔ | ✘ | ✘ |
| Billing run (manual) | ✔ | read-only | ✘ |
| Dashboard / reports | ✔ | ✔ | ✘ |
| Audit logs | ✔ | ✘ | ✘ |

The authoritative permission definitions are in [Security & RBAC](../architecture/security-and-rbac.md); if the two ever disagree, fix the discrepancy in a pull request — it is a documentation bug.
