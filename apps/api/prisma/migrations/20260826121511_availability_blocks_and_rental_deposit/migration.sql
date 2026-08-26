-- CreateEnum
CREATE TYPE "AssetAvailabilityBlockType" AS ENUM ('MAINTENANCE', 'REPAIR', 'INSPECTION', 'RELOCATION', 'MANUAL_BLOCK');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'DEPOSIT_RECEIPT';

-- CreateTable
CREATE TABLE "asset_availability_blocks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetAvailabilityBlockType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "relatedRentalId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelReason" TEXT,

    CONSTRAINT "asset_availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_deposits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "requiredAmountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "receivedAt" TIMESTAMP(3),
    "receivedAmountMinor" INTEGER,
    "receivedMethod" "PaymentMethod",
    "receivedReference" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnedAmountMinor" INTEGER,
    "retainedAmountMinor" INTEGER,
    "retentionReason" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_availability_blocks_tenantId_assetId_cancelledAt_idx" ON "asset_availability_blocks"("tenantId", "assetId", "cancelledAt");

-- CreateIndex
CREATE INDEX "asset_availability_blocks_tenantId_startAt_endAt_idx" ON "asset_availability_blocks"("tenantId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "rental_deposits_rentalId_key" ON "rental_deposits"("rentalId");

-- CreateIndex
CREATE INDEX "rental_deposits_tenantId_rentalId_idx" ON "rental_deposits"("tenantId", "rentalId");

-- AddForeignKey
ALTER TABLE "asset_availability_blocks" ADD CONSTRAINT "asset_availability_blocks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_availability_blocks" ADD CONSTRAINT "asset_availability_blocks_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_availability_blocks" ADD CONSTRAINT "asset_availability_blocks_relatedRentalId_fkey" FOREIGN KEY ("relatedRentalId") REFERENCES "rentals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_availability_blocks" ADD CONSTRAINT "asset_availability_blocks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_availability_blocks" ADD CONSTRAINT "asset_availability_blocks_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposits" ADD CONSTRAINT "rental_deposits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposits" ADD CONSTRAINT "rental_deposits_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposits" ADD CONSTRAINT "rental_deposits_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposits" ADD CONSTRAINT "rental_deposits_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
