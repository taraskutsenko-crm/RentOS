-- Data-only migration — no column types change. See docs/DECISIONS.md D-115.
--
-- Rental.plannedStart/plannedEnd, Quote.plannedStart/plannedEnd/validUntil,
-- AssetAvailabilityBlock.startAt/endAt, and RentalDeposit.receivedAt/
-- returnedAt were, until now, "floating" wall-clock digits with no real
-- timezone attached (D-066): the literal digits typed into a picker passed
-- straight through unchanged, since the API server always runs with
-- TZ=UTC. Every comparison against a real instant (RentalsService.start(),
-- AvailabilityService's interval math, deriveOverdueStatus) was therefore
-- silently wrong for any tenant not on UTC — by however many hours that
-- tenant's real offset is.
--
-- This migration reinterprets each existing row's literal digit reading as
-- the wall-clock time in *that row's own tenant's* timezone (Tenant.timezone,
-- which has been set on every tenant since registration — see
-- register.dto.ts), and rewrites the column with the true UTC instant that
-- reading represents. The column stays "timestamp without time zone" —
-- only the *meaning* of the stored digits changes, from "naive, read back
-- with an explicit UTC formatter" to "the real UTC instant" (matching the
-- application code shipped alongside this migration).
--
-- Uses Postgres's own IANA tzdata via `AT TIME ZONE` — not hand-rolled
-- offset arithmetic. Applied exactly once, tracked by Prisma's migration
-- history (_prisma_migrations); re-running it would double-shift every
-- value, which is why it must never be run outside `prisma migrate deploy`.
--
-- Quote.issueDate is deliberately EXCLUDED: unlike the fields above, every
-- existing row's issueDate is a genuine server-generated instant
-- (`new Date()` at creation — verified against real data: issueDate is
-- always within milliseconds of createdAt on every existing row, and no
-- frontend field has ever let a user set it explicitly). Reinterpreting an
-- already-correct instant as if it were a naive tenant-local reading would
-- incorrectly shift it. Invoice.issueDate/saleDate/dueDate are untouched
-- for a different reason: they are genuinely date-only business values,
-- never date+time, so no timezone reinterpretation applies to them at all.

UPDATE "rentals" r
SET "plannedStart" = (r."plannedStart" AT TIME ZONE t."timezone") AT TIME ZONE 'UTC',
    "plannedEnd"   = (r."plannedEnd"   AT TIME ZONE t."timezone") AT TIME ZONE 'UTC'
FROM "tenants" t
WHERE r."tenantId" = t."id";

UPDATE "quotes" q
SET "plannedStart" = (q."plannedStart" AT TIME ZONE t."timezone") AT TIME ZONE 'UTC',
    "plannedEnd"   = (q."plannedEnd"   AT TIME ZONE t."timezone") AT TIME ZONE 'UTC',
    "validUntil"   = (q."validUntil"   AT TIME ZONE t."timezone") AT TIME ZONE 'UTC'
FROM "tenants" t
WHERE q."tenantId" = t."id";

UPDATE "asset_availability_blocks" b
SET "startAt" = (b."startAt" AT TIME ZONE t."timezone") AT TIME ZONE 'UTC',
    "endAt"   = (b."endAt"   AT TIME ZONE t."timezone") AT TIME ZONE 'UTC'
FROM "tenants" t
WHERE b."tenantId" = t."id";

UPDATE "rental_deposits" d
SET "receivedAt" = CASE WHEN d."receivedAt" IS NULL THEN NULL
                        ELSE (d."receivedAt" AT TIME ZONE t."timezone") AT TIME ZONE 'UTC' END,
    "returnedAt" = CASE WHEN d."returnedAt" IS NULL THEN NULL
                        ELSE (d."returnedAt" AT TIME ZONE t."timezone") AT TIME ZONE 'UTC' END
FROM "tenants" t
WHERE d."tenantId" = t."id";
