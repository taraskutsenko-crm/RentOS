-- CreateEnum
CREATE TYPE "EmailErrorCategory" AS ENUM ('AUTH_FAILED', 'DOMAIN_NOT_VERIFIED', 'SMTP_REJECTED', 'CONNECTION_TIMEOUT', 'RECIPIENT_REJECTED', 'ATTACHMENT_GENERATION_FAILED', 'PROVIDER_ERROR');

-- AlterTable
ALTER TABLE "document_email_deliveries" ADD COLUMN     "errorCategory" "EmailErrorCategory";

-- AlterTable
ALTER TABLE "invoice_email_deliveries" ADD COLUMN     "errorCategory" "EmailErrorCategory";

-- AlterTable
ALTER TABLE "payment_demand_email_deliveries" ADD COLUMN     "errorCategory" "EmailErrorCategory";

-- AlterTable
ALTER TABLE "quote_email_deliveries" ADD COLUMN     "errorCategory" "EmailErrorCategory";
