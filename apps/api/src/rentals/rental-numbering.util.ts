import type { Prisma } from "@prisma/client";

/**
 * Generates the next RNT-###### rental number for a tenant. Extracted
 * verbatim from RentalsService so QuotesService's convert-to-rental flow can
 * reuse it without duplicating the logic (see ADR 0007). Behavior is
 * unchanged from the original private method.
 *
 * Known limitation (pre-existing, not fixed here): this is a
 * count-then-check pattern, not an atomic counter — two concurrent
 * transactions can race on the same candidate number, and the second
 * insert's unique-constraint violation is not caught/retried. Quotes uses a
 * genuinely atomic sequence instead (see quote-numbering.util.ts); fixing
 * rental numbering the same way is out of scope for TASK-0007.
 */
export async function generateRentalNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const existingCount = await tx.rental.count({ where: { tenantId } });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `RNT-${String(existingCount + 1 + attempt).padStart(6, "0")}`;
    const existing = await tx.rental.findUnique({
      where: { tenantId_rentalNumber: { tenantId, rentalNumber: candidate } },
    });
    if (!existing) {
      return candidate;
    }
  }
  return `RNT-${Date.now()}`;
}
