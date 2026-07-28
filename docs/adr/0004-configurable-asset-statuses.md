# ADR 0004: Configurable Asset Statuses

**Status:** Accepted
**Date:** 2026-07-28

## Context

Different rental businesses need different operational statuses for their
assets beyond a generic "available/unavailable" toggle — a portable-toilet
company cares about "needs pumping," a construction-equipment company
cares about "at job site," and so on — but the platform still needs a
guaranteed baseline (a status always exists, "available for rental" always
means something specific) so future rental/booking logic has a stable
contract to depend on.

## Decision

### `AssetStatusDefinition` is tenant-owned, with eight protected system rows

Every tenant gets eight system statuses (`AVAILABLE`, `RESERVED`, `RENTED`,
`INSPECTION_REQUIRED`, `MAINTENANCE`, `REPAIR`, `LOST`, `RETIRED`;
`isSystem = true`), defined once in
`apps/api/src/asset-statuses/system-statuses.ts`, and may additionally
define any number of custom statuses (`isSystem = false`). System status
**codes** cannot be renamed (blocked in `AssetStatusesService.update`) or
deleted (blocked in `.remove`) — but their **display name**, description,
color, icon, and `isAvailableForRental` flag are all still editable, so
"Display names may be localized ... or tenant-specific names" from the
task spec is satisfied without weakening the guarantee that `code` (the
stable machine identifier other code can key off) never moves.

Only `AVAILABLE` ships with `isAvailableForRental = true` by default; every
other system status represents an asset that, by definition, cannot
currently be rented. `isAvailableForRental` is itself an ordinary
tenant-editable boolean (including on system statuses), because "available
for rental" is a business policy choice, not a platform constant — a
tenant could equally decide `RESERVED` should still show as bookable in
some workflow.

### Seeded at two points, both idempotent

1. **New tenant registration** — `AuthService.register`'s transaction calls
   `AssetStatusesService.seedSystemStatuses(tenantId, tx)` right after the
   `OWNER` membership is created, so a brand-new tenant has its eight
   statuses before the transaction commits.
2. **API startup** — `AssetStatusesModule.onModuleInit` iterates every
   existing, non-deleted tenant and calls the same
   `seedSystemStatuses` method. This covers tenants that existed before
   this module shipped (there is no separate one-off backfill script to
   maintain) and literally implements the task's "...or when the Assets
   module is first initialized" alternative trigger.

`seedSystemStatuses` uses `createMany({ ..., skipDuplicates: true })`
against the `@@unique([tenantId, code])` constraint, so calling it
repeatedly (e.g. every API boot) is always a cheap no-op once a tenant is
fully seeded. This was chosen over a one-time migration script because it
self-heals: a tenant somehow missing a status (e.g. a future manual DB
intervention) is repaired on the next boot without operator action.

**Known limitation:** re-querying and looping over every tenant on every
boot is O(tenant count) and would need to become a targeted, one-time
backfill (or a background job) if tenant volume grows large enough for
that boot-time cost to matter. Acceptable at this stage.

### Status changes are atomic and always produce history

`AssetsService.changeStatus` wraps the `Asset.currentStatusId` update and
the new `AssetStatusHistory` row in a single `$transaction`, so a status
change and its audit trail can never diverge — there is no code path that
updates the pointer without recording the transition, and no code path
that records a transition without moving the pointer. `fromStatusId` is
nullable (for the discontinued idea of a synthetic "initial" transition,
kept nullable for forward compatibility) but in practice always populated
here since the asset always has a prior status.

An inactive status (`isActive = false`) cannot be assigned to an asset
(`BadRequestException` in `changeStatus`), so deactivating a custom status
is a safe way to retire it from use going forward without deleting it (and
therefore without needing to touch history rows that reference it).

### Deletion is blocked, never cascaded

A status cannot be deleted while `isSystem` is true, or while any
non-deleted `Asset.currentStatusId` still references it
(`ConflictException`, counted via `prisma.asset.count`). Soft-delete only
(`deletedAt` + `isActive = false`) — matching every other module in this
codebase — so historical `AssetStatusHistory` rows referencing a
since-deleted status remain fully resolvable.

## Consequences

- `AssetsService.create`, when no `statusId` is supplied, defaults to the
  tenant's `AVAILABLE` status by code lookup
  (`resolveDefaultStatusId`) — if that status were ever missing (it
  shouldn't be, given the seeding guarantees above), asset creation fails
  loudly with a 400 rather than silently picking an arbitrary status.
- Because `code` is the only immutable, stable identifier for a system
  status, any future code that needs to special-case a status (e.g. a
  rentals module checking "is this asset in RENTED status") must key off
  `code`, never off `id` or `name` alone across tenants — `id` differs per
  tenant even for the "same" system status.
- No role-based restriction exists yet on which statuses a given
  `AssetStatusDefinition` role can transition an asset _between_ (e.g. "a
  TECHNICIAN can only move an asset in/out of MAINTENANCE") — the
  permission model (ADR pending in a future task, see
  `apps/api/src/permissions/permission.ts`) only gates _that_ a status can
  be changed at all via `assets.change_status`, not _which_ transitions are
  allowed. Noted as a known limitation in the completion report.
