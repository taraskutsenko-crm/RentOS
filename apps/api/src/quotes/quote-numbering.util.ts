import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

/**
 * Generates the next Q-<year>-###### quote number for a tenant, atomically.
 * Unlike Rental's count-then-check generateRentalNumber (see
 * rental-numbering.util.ts's known-limitation note), this uses a single
 * Postgres `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` against a
 * dedicated per-tenant-per-year counter row — the `ON CONFLICT DO UPDATE`
 * takes a row-level lock, so two concurrent transactions incrementing the
 * same (tenantId, year) counter are correctly serialized by Postgres
 * itself, never racing. The counter only ever increases — a cancelled or
 * deleted quote's number is never reused. Must be called with the same
 * transaction client the quote row itself is created in, so a rolled-back
 * create also rolls back the reserved number.
 */
export async function generateQuoteNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  issueDate: Date,
): Promise<string> {
  const year = issueDate.getUTCFullYear();

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "quote_sequences" ("id", "tenantId", "year", "lastNumber")
    VALUES (${randomUUID()}, ${tenantId}, ${year}, 1)
    ON CONFLICT ("tenantId", "year")
    DO UPDATE SET "lastNumber" = "quote_sequences"."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    throw new Error("Failed to generate quote number: sequence upsert returned no row");
  }

  return `Q-${year}-${String(lastNumber).padStart(6, "0")}`;
}
