# ADR 0002: Universal Asset Model

**Status:** Accepted
**Date:** 2026-07-28

## Context

RentOS must support renting and managing any kind of physical property —
vehicles, containers, tools, construction equipment, portable toilets,
generators, trailers, furniture, electronics, boats, medical equipment, and
anything else a rental business might own. TASK-0005 needed a single data
model and API surface that works identically for all of these, without the
business logic (or the schema) ever encoding assumptions specific to one
asset type.

## Decision

### One `Asset` table, not one table per asset type

There is exactly one `Asset` model. It carries only fields that are
universally meaningful to _any_ rentable item: identity (`internalNumber`,
`sku`, `serialNumber`, `barcode`, `qrCodeValue`), classification
(`categoryId`), lifecycle (`currentStatusId`, `isRentable`, `isActive`),
descriptive metadata (`name`, `manufacturer`, `model`, `description`),
money (`purchasePriceMinor`/`purchaseCurrency`,
`replacementValueMinor`/`replacementCurrency`), and a free-text location
(`currentLocationText`). Nothing on `Asset` is specific to a vehicle, a
container, or any other category — a `VIN`, `mileage`, `tank capacity`, or
`container volume` column would violate this by definition and is
explicitly rejected (see Restrictions in the task spec). Type-specific
attributes live entirely in `AssetCustomFieldDefinition` /
`AssetCustomFieldValue` — see ADR 0003.

We rejected the alternative of a table-per-type (e.g. `Vehicle`,
`Container`, `Generator` tables) or a supertype/subtype pattern
(class-table inheritance) because:

- It requires a schema migration every time a tenant needs a new asset
  type, which defeats "any other rentable property" from the task's own
  requirements.
- Every cross-type feature (search, list, filter, timeline, rentals in a
  future task) would need to fan out across N tables instead of querying
  one.
- Tenants have genuinely different type taxonomies; hardcoding a fixed set
  of tables can never match every tenant's business.

### Categories are tenant-authored data, not platform code

`AssetCategory` is a plain, tenant-scoped, self-referential tree
(`parentId`) with no built-in taxonomy. "Vehicles", "Containers", "Tools"
are examples in documentation and tests only — nothing seeds them
automatically for a new tenant (a tenant starts with zero categories and
creates their own). This keeps the platform genuinely type-agnostic: the
category tree _is_ the tenant's business model, not a fixed platform
concept.

### Money: integer minor units + ISO 4217, never floating point

`purchasePriceMinor` / `replacementValueMinor` are `Int` columns holding
the amount in the currency's smallest unit (e.g. cents), paired with a
`purchaseCurrency` / `replacementCurrency` `VARCHAR(3)` validated against a
supported ISO 4217 code list (`packages/shared/src/currencies.ts`). Floating
point is never used for money anywhere in the stack — the same rule already
applied informally elsewhere in the codebase, made explicit and enforced
here via `class-validator` (`@IsInt`) on the DTOs and
`AssetsService.assertMoneyPairing`, which rejects a minor-units value
without its paired currency (and vice versa). The frontend only ever
displays/collects major-unit amounts and converts at the boundary
(`apps/web/src/lib/money.ts`); a simplification (2 decimal places assumed
for every currency) is noted there as a known limitation — a
zero-decimal currency like JPY would need its own minor-unit exponent in a
follow-up task.

### Location: free text now, structured later

`AssetLocationHistory.newLocation` / `previousLocation` are plain text.
Per the task's restrictions, branches, warehouses, and GPS tracking are out
of scope for TASK-0005. Rather than adding unused nullable columns
speculatively, the extension point is documented here instead: a future
task can add `branchId`/`warehouseId` foreign keys and/or `latitude`/
`longitude` columns to `AssetLocationHistory` (and mirror them onto
`Asset.currentLocationText`'s replacement) without breaking the free-text
history that exists today — old rows simply have those new columns null.

### Tenant isolation and cross-tenant referential integrity

Every asset-module table carries a `tenantId` column with `onDelete:
Cascade` back to `Tenant`, and every service method scopes both reads and
writes by `tenantId` directly in the Prisma `where` clause — mutations use
`updateMany` + a result-count check rather than `findFirst` then `update`,
so a cross-tenant write is structurally impossible rather than merely
guarded (the same pattern the Customers module already established). Every
foreign key that points at another tenant-scoped row (`Asset.categoryId`,
`Asset.currentStatusId`, `AssetCustomFieldDefinition.categoryId`, …) is
additionally verified to belong to the same tenant in the service layer
before use (`assertCategoryBelongsToTenant`, `assertStatusBelongsToTenant`),
because a foreign key alone cannot express "and it must belong to tenant
X" — see the Customers module's `TenantGuard` note in ADR 0001, which this
extends to a much larger set of related entities.

## Consequences

- Every business feature (search, filters, timeline) must be written
  generically against `Asset` + `AssetCustomFieldValue`, which is a
  deliberate constraint that keeps the platform honestly universal — but it
  does mean feature code can never take a shortcut like `if
(asset.category === 'vehicle') { ... }`.
- Category and custom-field configuration is tenant-owned data-entry work;
  RentOS ships with zero pre-configured categories or fields for any
  tenant. This is intentional (see the task's explicit "do not seed
  automatically" requirement) but does mean a new tenant must configure
  their category/field taxonomy before assets are useful — a natural
  extension point for a future "starter template" feature, not built here.
- Money simplification (2-decimal assumption) and location simplification
  (free text) are both documented, bounded known limitations rather than
  silent gaps.
