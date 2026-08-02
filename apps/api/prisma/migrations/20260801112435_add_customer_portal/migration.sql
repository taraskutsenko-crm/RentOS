-- CreateEnum
CREATE TYPE "CustomerPortalMessageSender" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "CustomerNotificationType" AS ENUM ('MESSAGE', 'DOCUMENT_SHARED', 'SIGNATURE_REQUESTED', 'EXTENSION_RESPONSE', 'RENTAL_UPDATE', 'DAMAGE_REPORT_UPDATE');

-- CreateEnum
CREATE TYPE "RentalExtensionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalDamageReportStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'RESOLVED', 'CONVERTED_TO_DOCUMENT');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "portalActivatedAt" TIMESTAMP(3),
ADD COLUMN     "portalInvitationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "portalInvitationTokenHash" TEXT,
ADD COLUMN     "portalInvitedAt" TIMESTAMP(3),
ADD COLUMN     "portalLastLoginAt" TIMESTAMP(3),
ADD COLUMN     "portalPasswordHash" TEXT;

-- CreateTable
CREATE TABLE "customer_refresh_tokens" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "customer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_portal_messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rentalId" TEXT,
    "senderType" "CustomerPortalMessageSender" NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readByCustomerAt" TIMESTAMP(3),
    "readByStaffAt" TIMESTAMP(3),

    CONSTRAINT "customer_portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CustomerNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_extension_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentEnd" TIMESTAMP(3) NOT NULL,
    "requestedEnd" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "status" "RentalExtensionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responseMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,

    CONSTRAINT "rental_extension_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_damage_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "assetId" TEXT,
    "description" TEXT NOT NULL,
    "status" "RentalDamageReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "convertedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "rental_damage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_damage_report_photos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "damageReportId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_damage_report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_refresh_tokens_tokenHash_key" ON "customer_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_refresh_tokens_customerId_idx" ON "customer_refresh_tokens"("customerId");

-- CreateIndex
CREATE INDEX "customer_refresh_tokens_expiresAt_idx" ON "customer_refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "customer_portal_messages_tenantId_customerId_createdAt_idx" ON "customer_portal_messages"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_portal_messages_tenantId_rentalId_idx" ON "customer_portal_messages"("tenantId", "rentalId");

-- CreateIndex
CREATE INDEX "customer_notifications_tenantId_customerId_createdAt_idx" ON "customer_notifications"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_notifications_tenantId_customerId_readAt_idx" ON "customer_notifications"("tenantId", "customerId", "readAt");

-- CreateIndex
CREATE INDEX "rental_extension_requests_tenantId_rentalId_idx" ON "rental_extension_requests"("tenantId", "rentalId");

-- CreateIndex
CREATE INDEX "rental_extension_requests_tenantId_customerId_idx" ON "rental_extension_requests"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "rental_extension_requests_tenantId_status_idx" ON "rental_extension_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rental_damage_reports_convertedDocumentId_key" ON "rental_damage_reports"("convertedDocumentId");

-- CreateIndex
CREATE INDEX "rental_damage_reports_tenantId_rentalId_idx" ON "rental_damage_reports"("tenantId", "rentalId");

-- CreateIndex
CREATE INDEX "rental_damage_reports_tenantId_customerId_idx" ON "rental_damage_reports"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "rental_damage_reports_tenantId_status_idx" ON "rental_damage_reports"("tenantId", "status");

-- CreateIndex
CREATE INDEX "rental_damage_report_photos_tenantId_damageReportId_idx" ON "rental_damage_report_photos"("tenantId", "damageReportId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_portalInvitationTokenHash_key" ON "customers"("portalInvitationTokenHash");

-- AddForeignKey
ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_messages" ADD CONSTRAINT "customer_portal_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_messages" ADD CONSTRAINT "customer_portal_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_messages" ADD CONSTRAINT "customer_portal_messages_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_messages" ADD CONSTRAINT "customer_portal_messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_extension_requests" ADD CONSTRAINT "rental_extension_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_extension_requests" ADD CONSTRAINT "rental_extension_requests_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_extension_requests" ADD CONSTRAINT "rental_extension_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_extension_requests" ADD CONSTRAINT "rental_extension_requests_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_convertedDocumentId_fkey" FOREIGN KEY ("convertedDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_reports" ADD CONSTRAINT "rental_damage_reports_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_report_photos" ADD CONSTRAINT "rental_damage_report_photos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_damage_report_photos" ADD CONSTRAINT "rental_damage_report_photos_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "rental_damage_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

