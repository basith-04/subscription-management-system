# F09 implementation checklist

Status: **blocked on prerequisites**. This is not a completed feature.

## Prerequisite assessment

- [x] Inspect `origin/main`, F04–F08, F09's A–I requirements, API, schema,
  state-machine, billing and ownership conventions.
- [x] Identify the existing F06 `computeEffectivePrice`, F07
  `assertPlanAvailable`, shared money helper, auth middleware and audit writer.
- [x] F04: merge the customer implementation and `CustomerSelect` from main.
- [ ] F05: implement and integrate tax rules and payment terms, their migrations,
  active-record lookups and selectors. Main currently contains placeholders;
  [PR #12](https://github.com/basith-04/subscription-management-system/pull/12)
  is open and should be reviewed and merged by its owner first. Its shared auth,
  database and frontend-context changes require integration review.
- [ ] F08: integrate quotation template migrations, `getTemplateForUse`,
  `TemplateSelect` and `LineItemsEditor`. Main currently has placeholders and
  no F08 migration or editor.
- [ ] F00/F09: implement the shared conditional transition helper and wire the
  F09 rule table into transactional services once coordinated.
- [ ] Repair remaining main baseline defects before end-to-end work: frontend
  `StaffListPage` fails typecheck; F06 product tests use obsolete demo identity
  headers; the two identity baselines both create `roles`/`users`, and the F07
  migration sorts before its F06 prerequisites. Reconcile those through the
  owning features without editing merged migrations or inventing tables.

## Independent F09 work

- [x] Implement and unit-test the pure, pre-discount pricing calculator using
  F06's existing effective-price helper and integer minor units.
- [x] Verify 100 tax-rounding cases against PostgreSQL `numeric`; verify the
  `33.33 × 5% = 1.67` case and override precedence with focused unit tests.
- [x] Implement and test the pure F09 issue/confirm/cancel state-rule table;
  expiry, ownership, locking and auditing remain service responsibilities.
- [ ] Wire pricing into creation, editing and detail responses when F09's
  transaction boundaries and F05/F08 contracts are available.

## Remaining F09 work

- [ ] Add the documented `subscriptions`/`subscription_items` migration and
  `subscription_number_seq` after prerequisite migrations are integrated.
- [ ] Implement repositories, services, state machine, validation, RBAC,
  transactional audit history and the quotation/subscription API.
- [ ] Integrate all five staff pages, template prefill, shared line editor,
  list filters, loading/error/success states and history timeline.
- [ ] Verify concurrency, rollback, ownership, price snapshots, downstream
  F10/F11/F12/F14/F15 contracts and the full browser walkthrough.
- [ ] Run complete regression, lint, typecheck and build suites after the
  baseline failures and required features are resolved.

## Preflight evidence

At `origin/main` commit `6feb0ec`, backend typecheck, lint and build pass (lint
has an existing unused-import warning). The full backend suite against an
isolated PostgreSQL 16 database reports 186 passing tests and three failing F06
product tests because those tests send demo headers rather than session cookies.
Frontend tests pass (42), while its build fails because `StaffListPage.tsx` has
an unused `navigate` parameter. The unscoped migration runner previously failed
on an empty PostgreSQL 16 database because both baseline migrations create
`roles`; neither migration changed in the F04 merge. These failures predate F09.
