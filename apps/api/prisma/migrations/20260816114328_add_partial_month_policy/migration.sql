-- CreateEnum
CREATE TYPE "PartialMonthPolicy" AS ENUM ('PRORATE_BY_DAY', 'ROUND_UP_TO_FULL_MONTH');

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "partialMonthPolicy" "PartialMonthPolicy";

-- AlterTable
ALTER TABLE "rental_billing_settings" ADD COLUMN     "partialMonthPolicy" "PartialMonthPolicy" NOT NULL DEFAULT 'PRORATE_BY_DAY';

-- AlterTable
ALTER TABLE "rental_items" ADD COLUMN     "partialMonthPolicy" "PartialMonthPolicy";
