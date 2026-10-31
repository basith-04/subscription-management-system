# Documentation Index

> **Status:** Architecture and planning documents. The system is at the **scaffold stage** — the backend and frontend have base structure, but the business features are **not implemented yet**. Everything here describes the proposed design. Items tagged `OPEN QUESTION` need a team decision.

## Suggested reading order

| # | Document | Read it to learn… |
|---|---|---|
| 1 | [System Architecture](architecture/system-architecture.md) | what we are building, requirements, stack, how the pieces fit |
| 2 | [Database Design](database/database-design.md) | every table, column, constraint and snapshot rule |
| 3 | [State Machines](architecture/state-machines.md) | subscription and invoice lifecycles; plan policy vs subscription state |
| 4 | [Billing Engine](architecture/billing-engine.md) | the critical logic: periods, discounts, tax, duplicate prevention, reliability |
| 5 | [Data Flows](architecture/data-flows.md) | the eight key workflows end to end |
| 6 | [API Specification](api/api-specification.md) | the REST contract frontend and backend share |
| 7 | [Security & RBAC](architecture/security-and-rbac.md) | roles, permissions, protection rules |
| 8 | [Development Roadmap](development/development-roadmap.md) | phases, parallel work streams, critical path |
| 9 | [Git Workflow](development/git-workflow.md) | how the four of us collaborate without breaking each other's work |
| 10 | [User Access & Authorization](architecture/user-access-and-authorization.md) | identity, entitlements, sessions, revocation, webhooks |
| 11 | [Directory Guidelines](development/directory-guidelines.md) | where every kind of file lives, naming, imports, shared-file rules |
| 12 | [Feature Breakdown](implementation/feature-breakdown.md) | features each person can build end to end, with dependencies |

## Conventions used in the docs
- **[Official]** – required by the problem statement. **[Proposed]** – our engineering decision.
- `OPEN QUESTION` – undecided; the document states the default we assume.
- Money is always exact decimal (`NUMERIC(12,2)`), never floating point.
- Mermaid diagrams render on GitHub; to preview locally use a Mermaid-capable Markdown viewer.
- When code and docs disagree, fix whichever is wrong in the same pull request.
