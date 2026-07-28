# ADR 0003: Custom-Field Storage Strategy

**Status:** Accepted
**Date:** 2026-07-28

## Context

Per ADR 0002, type-specific attributes (a vehicle's VIN, a generator's
power rating, a portable toilet's tank capacity) must never be columns on
`Asset`. They need somewhere to live that is (a) fully tenant-configurable,
(b) safely typed and validated, (c) queryable for filtering/search on the
fields a tenant marks as such, and (d) doesn't require a schema migration
every time a tenant adds a field.

## Decision

### Two tables: definitions and values (EAV via typed JSON)

`AssetCustomFieldDefinition` describes a field (name, machine-safe `key`,
`fieldType`, `isRequired`/`isFilterable`/`isSearchable`, `validationRules`,
`options`) either globally (`categoryId = null`, applies to every asset) or
scoped to one category. `AssetCustomFieldValue` stores exactly one row per
`(assetId, fieldDefinitionId)` pair (enforced by a unique index), with the
actual value in a `valueJson` `Json` column.

We considered three alternatives and rejected them:

1. **A wide, sparse `Asset` table with pre-allocated columns** (`customField1`,
   `customField2`, ...) — brittle, has a hard ceiling, and every column is
   meaningless without out-of-band metadata explaining what it holds.
2. **A separate physical table per field type** (`AssetTextFieldValue`,
   `AssetNumberFieldValue`, …) — avoids the "everything is a string"
   problem of naive EAV, but multiplies the number of tables and JOINs
   needed for something as simple as "show me this asset's custom fields,"
   and still needs a JSON-like column for `MULTISELECT` regardless.
3. **Fully dynamic per-tenant tables/columns** (`ALTER TABLE` at runtime) —
   operationally dangerous (arbitrary DDL driven by tenant input),
   effectively impossible to do safely in a multi-tenant shared-schema
   database, and explicitly the kind of dynamic-schema complexity the task
   asked to avoid ("do not introduce microservices," keep it a modular
   monolith with a stable schema).

A single `Json` column keyed by field definition is the standard, proven
EAV-via-JSON pattern: one predictable table shape, one index strategy, and
PostgreSQL's native `JSONB` support gives us real (if limited) queryability
without a fourth table per type. The cost — see Consequences — is that the
database itself cannot enforce "this JSON value must be an integer between
0 and 100"; that enforcement is application-level, by design (see below).

### Validation is entirely declarative — never executable code

`AssetCustomFieldDefinition.validationRules` is a small, closed JSON shape
(`min`, `max`, `minLength`, `maxLength`, `pattern`) — see
`apps/api/src/asset-custom-fields/field-definition-rules.ts`. Every key is
individually allow-listed per `fieldType` (e.g. `pattern` only applies to
string-like types; `min`/`max` only to numeric types), and `pattern` is
compiled once as a `RegExp` and only ever used with `.test()` — it is data,
never `eval`'d, never used as a template, never passed to a shell or a
dynamic `Function` constructor. This satisfies the task's explicit "do not
use arbitrary executable code in validationRules" requirement structurally,
not just by convention.

Actual value validation happens in
`apps/api/src/asset-custom-fields/field-value-validator.ts`
(`validateFieldValue`), called from both `AssetCustomFieldsService` (when
saving option/validationRules shape) and `AssetFieldValuesService`
(`AssetsService`'s helper, when saving an asset's actual custom field
values). Every `AssetFieldType` has its own case: strings get
length/pattern checks, numbers get range checks, `DATE`/`DATETIME` are
parsed and normalized, `SELECT`/`MULTISELECT` are checked against the
field's configured `options`. The function is pure and independently unit
tested (`field-value-validator.spec.ts`) against real Postgres-free inputs.

### Required-field enforcement

`AssetFieldValuesService.resolve()` computes the _effective_ value set for
an asset (existing stored values merged with the incoming payload) and
then checks every `isRequired` definition applicable to the asset's
category has a value in that merged set — run on both create and update,
including when `categoryId` changes to one with additional required
fields. This is what "required fields must be enforced on asset
create/update" means operationally: it's not just "did the client send
this key," it's "does the asset end up with a value for it."

### Type-change safety

Changing `fieldType` on a definition that already has stored values is
rejected outright (`ConflictException`) if any `AssetCustomFieldValue` rows
reference it — see `AssetCustomFieldsService.update`. We do not implement
an automatic "safe migration" (e.g. attempting to coerce existing string
values to numbers); the task allows this ("...unless a safe migration is
performed") but building a general-purpose type-coercion migration engine
for twelve field types is out of scope here. The operator's path today is:
delete/replace the offending values, then change the type. A migration
tool is a natural, separately-scoped follow-up.

### Query strategy: filterable/searchable are opt-in and index-bounded

Only definitions with `isFilterable = true` participate in the
`customFields` list-query filter, and only `isSearchable = true`
definitions participate in free-text `search`. This directly satisfies
"search/filter support only for definitions marked filterable/searchable"
and keeps queries bounded — the filter clause always joins through
`AssetCustomFieldValue.fieldDefinitionId` (not by decoding the JSON blob's
key from field metadata elsewhere), so it's always exact-match through a
proper key.

We deliberately did **not** add a GIN index on `AssetCustomFieldValue.valueJson`
itself. The values are one JSON scalar per row already keyed by a
B-tree-indexed `fieldDefinitionId` (`@@index([tenantId, fieldDefinitionId])`),
so lookups by field are already index-bound; a GIN index over the JSON
payload would only pay off for containment/path queries we don't perform,
matching the task's "without over-indexing JSON unnecessarily" instruction.
Filtering by value still requires a value-column scan within the
already-narrow `fieldDefinitionId` set, which is acceptable at this stage —
revisit if a specific slow query plan is observed in production.

## Consequences

- Postgres cannot enforce field-level constraints (required, min/max,
  pattern) at the DDL level — a direct SQL write bypassing the API could in
  principle insert an invalid value. This is an accepted tradeoff shared by
  every EAV-style design; the API is the only supported write path, exactly
  as with every other business rule in this codebase (e.g. tenant
  isolation itself is also enforced in the service layer, not the DB
  schema, aside from the FK/unique constraints that _can_ be expressed
  declaratively).
- `valueJson` typing at the TypeScript layer is `unknown` until validated;
  callers must always go through `validateFieldValue` — there is no way to
  read a "trusted" typed value directly from Prisma.
- Reassigning a field to a different category, or changing its type while
  values exist, requires explicit operator action; there is no automatic
  migration tool yet.
