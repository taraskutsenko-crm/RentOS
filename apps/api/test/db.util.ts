import type { PrismaClient } from "@prisma/client";

/** Deletes all rows in dependency order. Test database only. */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.documentSignatureRequest.deleteMany();
  await prisma.documentEmailDelivery.deleteMany();
  await prisma.documentShareLink.deleteMany();
  await prisma.documentStatusHistory.deleteMany();
  await prisma.documentFile.deleteMany();
  await prisma.documentItem.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentTemplateVersion.deleteMany();
  await prisma.documentTemplate.deleteMany();
  await prisma.documentSequence.deleteMany();
  await prisma.quoteStatusHistory.deleteMany();
  await prisma.quoteDocument.deleteMany();
  await prisma.quoteItem.deleteMany();
  await prisma.rentalStatusHistory.deleteMany();
  await prisma.rentalItem.deleteMany();
  await prisma.rental.deleteMany();
  await prisma.rentalBillingSettings.deleteMany();
  await prisma.rentalSequence.deleteMany();
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
