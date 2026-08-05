# Documentation

- [`PRODUCT_BIBLE.md`](PRODUCT_BIBLE.md) — the highest-level product
  document: product vision, philosophy, and the decision framework
  every future feature is checked against. **Read this before every
  other document below**, including `ARCHITECTURE_LOCK.md`.
- [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) — mandatory governance
  reference for every future task and AI session: locked architectural
  principles, extensible areas, changes that require a new ADR before
  implementation, forbidden shortcuts, and the verification contract
  every task must satisfy. Read this before starting any task.
- [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) — Havelio's permanent
  visual identity: color system, typography, spacing, radius, shadows,
  icons, illustrations, chart style, logo/app-icon guidelines, motion,
  product voice, empty states, and document style. Every visual value
  used anywhere in the product traces back to this file.
- [`UI_PATTERNS.md`](UI_PATTERNS.md) — every reusable interface pattern
  (navigation, tables, forms, dialogs, dropdowns, empty/loading/error
  states, and more), each with its purpose, when (not) to use it, and
  its visual/keyboard/loading/empty/error/disabled/mobile behavior.
- [`UX_PRINCIPLES.md`](UX_PRINCIPLES.md) — 30 permanent behavioral
  rules for how the product acts, each grounded in a real decision or
  the stated brand personality.
- [`UI_RESEARCH.md`](UI_RESEARCH.md) — the premium-SaaS interaction
  principles (Linear, Stripe Dashboard, Vercel, Figma, GitHub, Notion)
  that inform TASK-0010's redesign — principles only, never Havelio's
  own visual identity, which stays governed by `BRAND_GUIDELINES.md`.
- [`UI_AUDIT.md`](UI_AUDIT.md) — an evidence-based audit of the
  current staff app shell against the three docs above, including a
  concrete permission-gating bug found by direct code inspection.
- [`UI_COMPONENT_INVENTORY.md`](UI_COMPONENT_INVENTORY.md) — a catalog
  of every existing UI building block, shared and per-page, as of the
  start of TASK-0010 Part 2.
- [`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) — the phased TASK-0010
  plan; each chapter's scope, design decisions, and what it explicitly
  defers.
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
  Assets, Rentals, Quotes, the Document Management Platform, and the
  Customer Portal endpoints.
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
  - [0010 — Document Management Platform (Part 1)](adr/0010-document-management-platform.md)
  - [0011 — Document rendering, templates, public sharing, email, and e-signature foundation (Part 2)](adr/0011-document-rendering-and-sharing.md)
  - [0012 — Customer portal and Havelio rebrand](adr/0012-customer-portal.md)
