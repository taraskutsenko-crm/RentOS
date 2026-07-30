-- CreateEnum
CREATE TYPE "MonthlyBillingStrategy" AS ENUM ('CALENDAR_MONTH', 'FIXED_30_DAYS', 'CUSTOM');

-- AlterTable
ALTER TABLE "rental_items" ADD COLUMN     "customMonthLengthDays" INTEGER,
ADD COLUMN     "monthlyBillingStrategy" "MonthlyBillingStrategy";

-- CreateTable
CREATE TABLE "rental_billing_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monthlyBillingStrategy" "MonthlyBillingStrategy" NOT NULL DEFAULT 'CALENDAR_MONTH',
    "customMonthLengthDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_billing_settings_tenantId_key" ON "rental_billing_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "rental_billing_settings" ADD CONSTRAINT "rental_billing_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

