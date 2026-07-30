-- CreateTable
CREATE TABLE "rental_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rental_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_sequences_tenantId_key" ON "rental_sequences"("tenantId");

-- AddForeignKey
ALTER TABLE "rental_sequences" ADD CONSTRAINT "rental_sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: initialize each tenant's counter from the highest
-- EXISTING rental number matching the standard RNT-###### (exactly 6
-- digits) format, so the next atomically-generated number can never
-- collide with a preserved historical one. No existing "rentals" row is
-- read destructively or modified by this migration — rental numbers are
-- never renumbered.
--
-- Tenants with no rentals, or whose rental numbers don't match this
-- exact pattern (e.g. the old count-then-check generator's rare
-- exhausted-retry fallback, which used `RNT-${Date.now()}` — a
-- 13-digit epoch-millisecond value, not 6 digits), are deliberately left
-- without a counter row here. This is safe, not a gap: the first call to
-- generateRentalNumber() for such a tenant creates its counter starting
-- at 1 via the same atomic upsert used for every other tenant, and a
-- fresh counter can only theoretically collide with a nonstandard
-- historical number if a future generated number happens to exactly
-- match one — a risk that already existed (and was already accepted) in
-- the old fallback path itself, not a new one introduced here.
INSERT INTO "rental_sequences" ("id", "tenantId", "lastNumber")
SELECT gen_random_uuid()::text, "tenantId", MAX(CAST(SUBSTRING("rentalNumber" FROM 5) AS INTEGER))
FROM "rentals"
WHERE "rentalNumber" ~ '^RNT-[0-9]{6}$'
GROUP BY "tenantId"
ON CONFLICT ("tenantId") DO NOTHING;
