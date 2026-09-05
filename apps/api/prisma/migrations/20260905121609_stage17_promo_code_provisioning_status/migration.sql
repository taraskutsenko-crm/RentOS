-- CreateEnum
CREATE TYPE "PromoProvisioningStatus" AS ENUM ('PENDING', 'PROVISIONED', 'FAILED');

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "provisioningError" TEXT,
ADD COLUMN     "provisioningStatus" "PromoProvisioningStatus" NOT NULL DEFAULT 'PENDING';
