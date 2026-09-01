-- CreateEnum
CREATE TYPE "PaymentDemandStatus" AS ENUM ('GENERATED', 'SENT');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "sourceRentalDepositId" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedByUserId" TEXT;

-- CreateTable
CREATE TABLE "payment_demands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "demandNumber" TEXT NOT NULL,
    "status" "PaymentDemandStatus" NOT NULL DEFAULT 'GENERATED',
    "countryCode" VARCHAR(2) NOT NULL,
    "documentLanguage" VARCHAR(10) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "originalDueDate" TIMESTAMP(3),
    "requestedDeadline" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "originalAmountMinor" INTEGER NOT NULL,
    "paidAmountMinor" INTEGER NOT NULL,
    "outstandingAmountMinor" INTEGER NOT NULL,
    "creditorSnapshot" JSONB NOT NULL,
    "debtorSnapshot" JSONB NOT NULL,
    "bankSnapshot" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "payment_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_demand_sequences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_demand_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_demand_email_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentDemandId" TEXT NOT NULL,
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

    CONSTRAINT "payment_demand_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_demands_tenantId_invoiceId_idx" ON "payment_demands"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "payment_demands_tenantId_customerId_idx" ON "payment_demands"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_demands_tenantId_demandNumber_key" ON "payment_demands"("tenantId", "demandNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payment_demand_sequences_tenantId_year_month_key" ON "payment_demand_sequences"("tenantId", "year", "month");

-- CreateIndex
CREATE INDEX "payment_demand_email_deliveries_tenantId_paymentDemandId_cr_idx" ON "payment_demand_email_deliveries"("tenantId", "paymentDemandId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_tenantId_sourceRentalDepositId_idx" ON "payments"("tenantId", "sourceRentalDepositId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sourceRentalDepositId_fkey" FOREIGN KEY ("sourceRentalDepositId") REFERENCES "rental_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demands" ADD CONSTRAINT "payment_demands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demands" ADD CONSTRAINT "payment_demands_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demands" ADD CONSTRAINT "payment_demands_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demands" ADD CONSTRAINT "payment_demands_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demand_sequences" ADD CONSTRAINT "payment_demand_sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demand_email_deliveries" ADD CONSTRAINT "payment_demand_email_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demand_email_deliveries" ADD CONSTRAINT "payment_demand_email_deliveries_paymentDemandId_fkey" FOREIGN KEY ("paymentDemandId") REFERENCES "payment_demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_demand_email_deliveries" ADD CONSTRAINT "payment_demand_email_deliveries_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
