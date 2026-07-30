import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

/**
 * Generates the next RNT-###### rental number for a tenant, atomically.
 * Mirrors quote-numbering.util.ts's `generateQuoteNumber` exactly, minus
 * the year dimension (the existing rental-number format has never had
 * one — see ADR 0008's numbering-fix note): a single Postgres
 * `INSERT ... ON CONFLICT ("tenantId") DO UPDATE ... RETURNING` against a
 * dedicated per-tenant counter row (`RentalSequence`). The
 * `ON CONFLICT DO UPDATE` takes a row-level lock, so two concurrent
 * transactions incrementing the same tenant's counter are correctly
 * serialized by Postgres itself — never racing, and never dependent on
 * process-local memory, so this is safe across multiple application
 * processes/containers too. The counter only ever increases — a
 * cancelled or deleted rental's number is never reused. Must be called
 * with the same transaction client the rental row itself is created in,
 * so a rolled-back create also rolls back the reserved number.
 *
 * Replaces a previous count-then-check implementation (count existing
 * rentals, probe up to 5 candidate numbers, fall back to a
 * `Date.now()`-based number if all 5 collided) that could produce
 * colliding candidates under concurrent requests — see
 * docs/adr/0008-configurable-monthly-billing-strategies.md and
 * docs/DECISIONS.md (D-016/D-017) for the fix and its migration
 * behavior. The `@@unique([tenantId, rentalNumber])` database
 * constraint remains the final safeguard regardless.
 */
export async function generateRentalNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "rental_sequences" ("id", "tenantId", "lastNumber")
    VALUES (${randomUUID()}, ${tenantId}, 1)
    ON CONFLICT ("tenantId")
    DO UPDATE SET "lastNumber" = "rental_sequences"."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    throw new Error("Failed to generate rental number: sequence upsert returned no row");
  }

  return `RNT-${String(lastNumber).padStart(6, "0")}`;
}
