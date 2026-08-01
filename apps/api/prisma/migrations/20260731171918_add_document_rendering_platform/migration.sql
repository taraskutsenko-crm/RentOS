-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentSignatureProviderType" AS ENUM ('LOCAL_MOCK', 'DOCUSIGN', 'ADOBE_SIGN', 'AUTENTI', 'EIDAS');

-- CreateEnum
CREATE TYPE "DocumentSignatureStatus" AS ENUM ('REQUESTED', 'PENDING', 'SIGNED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentEmailRecipientType" AS ENUM ('CUSTOMER', 'EMPLOYEE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DocumentEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- DropIndex
DROP INDEX "document_templates_tenantId_documentType_isActive_idx";

-- AlterTable
ALTER TABLE "document_templates" DROP COLUMN "isActive",
DROP COLUMN "isDefault",
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "document_template_versions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "css" TEXT,
    "variablesSchema" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_share_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "lastAccessedIp" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_email_deliveries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "recipientType" "DocumentEmailRecipientType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "DocumentEmailStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "document_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signature_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "provider" "DocumentSignatureProviderType" NOT NULL DEFAULT 'LOCAL_MOCK',
    "status" "DocumentSignatureStatus" NOT NULL DEFAULT 'REQUESTED',
    "signerName" TEXT,
    "signerEmail" TEXT,
    "externalReference" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_template_versions_tenantId_templateId_idx" ON "document_template_versions"("tenantId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_templateId_versionNumber_key" ON "document_template_versions"("templateId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "document_share_links_tokenHash_key" ON "document_share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "document_share_links_tenantId_documentVersionId_idx" ON "document_share_links"("tenantId", "documentVersionId");

-- CreateIndex
CREATE INDEX "document_email_deliveries_tenantId_documentId_createdAt_idx" ON "document_email_deliveries"("tenantId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "document_signature_requests_tenantId_documentId_requestedAt_idx" ON "document_signature_requests"("tenantId", "documentId", "requestedAt");

-- CreateIndex
CREATE INDEX "document_templates_tenantId_documentType_status_idx" ON "document_templates"("tenantId", "documentType", "status");

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_share_links" ADD CONSTRAINT "document_share_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_share_links" ADD CONSTRAINT "document_share_links_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_share_links" ADD CONSTRAINT "document_share_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_email_deliveries" ADD CONSTRAINT "document_email_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_email_deliveries" ADD CONSTRAINT "document_email_deliveries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_email_deliveries" ADD CONSTRAINT "document_email_deliveries_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_email_deliveries" ADD CONSTRAINT "document_email_deliveries_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense-in-depth: at most one ACTIVE template per (tenantId, documentType),
-- mirroring AssetImage's isPrimary partial-unique-index pattern (see ADR
-- 0005) — DocumentTemplatesService.activate already enforces this
-- transactionally; this index guarantees the invariant even against a bug
-- or a concurrent write that bypasses the service layer.
CREATE UNIQUE INDEX "document_templates_one_active_per_type"
  ON "document_templates" ("tenantId", "documentType")
  WHERE "status" = 'ACTIVE';
