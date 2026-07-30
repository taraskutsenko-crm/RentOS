import type { PrismaClient } from "@prisma/client";

/** Deletes all rows in dependency order. Test database only. */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.quoteStatusHistory.deleteMany();
  await prisma.quoteDocument.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.rentalStatusHistory.deleteMany();
  await prisma.rentalItem.deleteMany();
  await prisma.rental.deleteMany();
  await prisma.rentalBillingSettings.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.quoteSequence.deleteMany();
  await prisma.assetCustomFieldValue.deleteMany();
  await prisma.assetImage.deleteMany();
  await prisma.assetDocument.deleteMany();
  await prisma.assetStatusHistory.deleteMany();
  await prisma.assetLocationHistory.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.assetCustomFieldDefinition.deleteMany();
  await prisma.assetCategory.deleteMany();
  await prisma.assetStatusDefinition.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.tenantMembership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
}
