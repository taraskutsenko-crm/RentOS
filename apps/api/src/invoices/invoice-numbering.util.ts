import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

/**
 * Generates the next invoice number for a tenant, atomically. Mirrors
 * generateQuoteNumber's proven `INSERT ... ON CONFLICT DO UPDATE ...
 * RETURNING` pattern (see quote-numbering.util.ts) against a dedicated
 * per-tenant-per-(year, month) counter row, so two concurrent transactions
 * incrementing the same counter are correctly serialized by Postgres
 * itself. The counter only ever increases — a cancelled/deleted invoice's
 * number is never reused. Must be called with the same transaction client
 * the invoice row itself is created in, so a rolled-back create also rolls
 * back the reserved number.
 *
 * The returned format ("INV-<year>-<month>-######") is Havelio's built-in
 * DEFAULT only — it is deliberately NOT a Polish "FV/YYYY/MM/NNNN" format
 * hard-coded into the platform (see docs/DECISIONS.md). A
 * tenant-configurable numbering format/prefix is documented future work;
 * this util's job is only the atomic counter, kept separate from display
 * formatting on purpose so that future work only touches the format
 * string below, never the concurrency-safe counter logic.
 */
export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  issueDate: Date,
): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "invoice_sequences" ("id", "tenantId", "year", "month", "lastNumber")
    VALUES (${randomUUID()}, ${tenantId}, ${year}, ${month}, 1)
    ON CONFLICT ("tenantId", "year", "month")
    DO UPDATE SET "lastNumber" = "invoice_sequences"."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    throw new Error("Failed to generate invoice number: sequence upsert returned no row");
  }

  return `INV-${year}-${String(month).padStart(2, "0")}-${String(lastNumber).padStart(6, "0")}`;
}
