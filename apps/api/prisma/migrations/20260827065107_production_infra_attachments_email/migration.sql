-- CreateEnum
CREATE TYPE "DocumentAttachmentCategory" AS ENUM ('HANDOVER_CONDITION', 'RETURN_CONDITION', 'DAMAGE', 'OTHER');

-- AlterTable
ALTER TABLE "document_email_deliveries" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "document_files" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "category" "DocumentAttachmentCategory";

-- CreateTable
CREATE TABLE "quote_email_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "DocumentEmailStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "sentByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "quote_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_email_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "DocumentEmailStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "sentByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "invoice_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_email_deliveries_tenantId_quoteId_createdAt_idx" ON "quote_email_deliveries"("tenantId", "quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_email_deliveries_tenantId_invoiceId_createdAt_idx" ON "invoice_email_deliveries"("tenantId", "invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "quote_email_deliveries" ADD CONSTRAINT "quote_email_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_email_deliveries" ADD CONSTRAINT "quote_email_deliveries_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_email_deliveries" ADD CONSTRAINT "quote_email_deliveries_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

