# Documentation

- [`VISION.md`](VISION.md) — the long-term product vision: what RentOS
  is, the problem it solves, and what's implemented vs. planned vs.
  long-term direction.
- [`ROADMAP.md`](ROADMAP.md) — structured, status-tagged roadmap:
  completed modules, current stabilization work, the next planned major
  task, later phases, and technical debt.
- [`HANDOVER.md`](HANDOVER.md) — the practical resume-work reference: repo
  structure, conventions, latest verified commit/CI state, and the exact
  commands to run.
- [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md) — the practical
  principles this codebase follows, each grounded in a real decision
  already made in the repository.
- [`DECISIONS.md`](DECISIONS.md) — a concise decision register linking to
  the full ADRs below.
- [`architecture.md`](architecture.md) — authentication flow, tenant
  resolution, RBAC, cookie security, local dev commands, required env vars,
  and the practical "how it works" reference for the Assets and Rentals
  modules.
- [`api.md`](api.md) — REST API reference for auth/tenancy, Customers,
  Assets, Rentals, and Quotes endpoints.
- [`adr/`](adr/) — architecture decision records.
  - [0001 — Authentication and tenant-context strategy](adr/0001-authentication-and-tenant-context.md)
  - [0002 — Universal asset model](adr/0002-universal-asset-model.md)
  - [0003 — Custom field storage strategy](adr/0003-custom-field-storage-strategy.md)
  - [0004 — Configurable asset statuses](adr/0004-configurable-asset-statuses.md)
  - [0005 — Asset file storage strategy](adr/0005-asset-file-storage-strategy.md)
  - [0006 — Rental lifecycle and availability engine](adr/0006-rental-lifecycle-and-availability.md)
  - [0007 — Quotes and commercial offers](adr/0007-quotes-and-commercial-offers.md)
  - [0008 — Configurable monthly billing strategies](adr/0008-configurable-monthly-billing-strategies.md)
  - [0009 — Shared monthly pricing and atomic rental numbering](adr/0009-shared-monthly-pricing-and-atomic-rental-numbering.md)
