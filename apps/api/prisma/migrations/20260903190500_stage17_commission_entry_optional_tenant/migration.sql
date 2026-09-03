-- DropForeignKey
ALTER TABLE "affiliate_commission_entries" DROP CONSTRAINT "affiliate_commission_entries_tenantId_fkey";

-- AlterTable
ALTER TABLE "affiliate_commission_entries" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
