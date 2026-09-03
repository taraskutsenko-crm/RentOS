import { Prisma, type PrismaClient } from "@prisma/client";

/** Deletes all rows in dependency order. Test database only. */
async function deleteAllRows(prisma: PrismaClient): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.paymentDemandEmailDelivery.deleteMany();
  await prisma.paymentDemand.deleteMany();
  await prisma.paymentDemandSequence.deleteMany();
  await prisma.invoiceStatusHistory.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.deleteMany();
  await prisma.companyBankAccount.deleteMany();
  await prisma.eInvoiceConnection.deleteMany();
  await prisma.rentalDamageReportPhoto.deleteMany();
  await prisma.rentalDamageReport.deleteMany();
  await prisma.customerPortalMessage.deleteMany();
  await prisma.rentalExtensionRequest.deleteMany();
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
  await prisma.assetAvailabilityBlock.deleteMany();
  await prisma.rentalDeposit.deleteMany();
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
  await prisma.customerNotification.deleteMany();
  await prisma.customerRefreshToken.deleteMany();
  await prisma.customer.deleteMany();
  // Havelio Billing / Affiliate domains (Stage 17) — deleted before
  // tenant/user, in child-before-parent order.
  await prisma.affiliateCommissionEntry.deleteMany();
  await prisma.affiliatePayout.deleteMany();
  await prisma.affiliateAttribution.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.affiliateCampaign.deleteMany();
  await prisma.affiliatePartner.deleteMany();
  await prisma.legalAcceptanceRecord.deleteMany();
  await prisma.havelioSubscription.deleteMany();
  await prisma.stripeWebhookEvent.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.tenantMembership.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
}

const FOREIGN_KEY_VIOLATION = "P2003";
const MAX_ATTEMPTS = 3;

/**
 * Deletes every row in dependency order, retrying the whole pass on a
 * foreign-key violation (Prisma error P2003). The delete order above is
 * correct as written, but a previous test's async side effect can very
 * rarely still be landing in Postgres after its own `Promise.all(...)` of
 * HTTP requests has already resolved (seen on a loaded CI runner, not
 * locally — e.g. a high-concurrency rental-creation test) — a stray
 * `RentalItem` insert arriving between this function's own
 * `rentalItem.deleteMany()` and `asset.deleteMany()` calls, for instance,
 * would otherwise fail the whole suite on nothing but timing. A second
 * pass re-deletes everything (now including whatever just slipped in) and
 * succeeds once that write has settled, without weakening isolation
 * between tests — every row is still gone before the next test starts.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await deleteAllRows(prisma);
      return;
    } catch (error) {
      const isForeignKeyRace =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION;
      if (!isForeignKeyRace || attempt === MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
}
