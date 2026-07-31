import { randomUUID } from "node:crypto";

import type { DocumentType, Prisma } from "@prisma/client";

/**
 * The number prefix for each DocumentType, and whether that type's numbers
 * are year-scoped (CON-000001 vs DOC-2026-000001). QUOTE has a reserved
 * prefix here purely for completeness — Document rows of type QUOTE are
 * never created in TASK-0008 Part 1 (the existing Quote module keeps its
 * own Q-<year>-###### numbering via quote-numbering.util.ts), so this entry
 * is unused today but keeps the map total over DocumentType.
 */
const DOCUMENT_NUMBER_PREFIXES: Record<DocumentType, string> = {
  QUOTE: "QT",
  CONTRACT: "CON",
  HANDOVER_PROTOCOL: "HD",
  RETURN_PROTOCOL: "RT",
  DAMAGE_REPORT: "DMG",
  CONTRACT_AMENDMENT: "AMD",
  CUSTOM: "DOC",
};

/**
 * Only CUSTOM documents are year-scoped (DOC-2026-000001) — every named
 * business type (contract, handover, return, damage report, amendment)
 * uses a flat counter with no year, matching this codebase's existing
 * RNT-###### rental-number convention (see rental-numbering.util.ts).
 * CUSTOM is year-scoped because it is the catch-all bucket for
 * tenant-defined document types and is expected to accumulate the most
 * volume over time — a year boundary keeps individual counters bounded,
 * the same reason QuoteSequence is year-scoped.
 */
const YEAR_SCOPED_DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set(["CUSTOM"]);

/**
 * Sentinel value for DocumentSequence.year on non-year-scoped types.
 * `year` cannot be nullable: Postgres unique constraints treat every NULL
 * as distinct from every other NULL, which would silently break the
 * `ON CONFLICT` upsert's atomicity below (two concurrent inserts with
 * year = NULL would never conflict with each other, defeating the whole
 * point of the atomic counter). 0 is never a real calendar year, so it is
 * unambiguous as a "not year-scoped" marker.
 */
const NO_YEAR_SENTINEL = 0;

/**
 * Generates the next document number for a tenant and DocumentType,
 * atomically — mirrors generateQuoteNumber/generateRentalNumber exactly: a
 * single Postgres `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` against
 * a dedicated per-(tenantId, documentType, year) counter row
 * (DocumentSequence). The `ON CONFLICT DO UPDATE` takes a row-level lock,
 * so concurrent transactions incrementing the same counter are correctly
 * serialized by Postgres itself, never racing and never dependent on
 * process-local memory — safe across multiple application
 * processes/containers. The counter only ever increases, so a
 * voided/deleted document's number is never reused. Must be called with
 * the same transaction client the document row itself is created in, so a
 * rolled-back create also rolls back the reserved number. The
 * `@@unique([tenantId, documentNumber])` database constraint on Document
 * remains the final safeguard regardless.
 */
export async function generateDocumentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentType: DocumentType,
  referenceDate: Date,
): Promise<string> {
  const isYearScoped = YEAR_SCOPED_DOCUMENT_TYPES.has(documentType);
  const year = isYearScoped ? referenceDate.getUTCFullYear() : NO_YEAR_SENTINEL;

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "document_sequences" ("id", "tenantId", "documentType", "year", "lastNumber")
    VALUES (${randomUUID()}, ${tenantId}, ${documentType}::"DocumentType", ${year}, 1)
    ON CONFLICT ("tenantId", "documentType", "year")
    DO UPDATE SET "lastNumber" = "document_sequences"."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    throw new Error("Failed to generate document number: sequence upsert returned no row");
  }

  const prefix = DOCUMENT_NUMBER_PREFIXES[documentType];
  const padded = String(lastNumber).padStart(6, "0");
  return isYearScoped ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}
