import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

/**
 * Generates the next Payment Demand number for a tenant, atomically —
 * mirrors generateInvoiceNumber's proven `INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING` pattern exactly, against its own dedicated
 * per-tenant-per-(year, month) counter row (`PaymentDemandSequence`),
 * never sharing InvoiceSequence's counter. The format
 * ("PD-<year>-<month>-######") is Havelio's international, country-neutral
 * default — Poland's "WEZWANIE DO ZAPŁATY" is a document TITLE/wording
 * choice made by the renderer (see payment-demand-renderer.service.ts),
 * never a different numbering scheme; the underlying demand number stays
 * one consistent format for every country (see docs/DECISIONS.md).
 */
export async function generatePaymentDemandNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  issueDate: Date,
): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const month = issueDate.getUTCMonth() + 1;

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "payment_demand_sequences" ("id", "tenantId", "year", "month", "lastNumber")
    VALUES (${randomUUID()}, ${tenantId}, ${year}, ${month}, 1)
    ON CONFLICT ("tenantId", "year", "month")
    DO UPDATE SET "lastNumber" = "payment_demand_sequences"."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    throw new Error("Failed to generate payment demand number: sequence upsert returned no row");
  }

  return `PD-${year}-${String(month).padStart(2, "0")}-${String(lastNumber).padStart(6, "0")}`;
}
