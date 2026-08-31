-- CreateEnum
CREATE TYPE "SignatureSignerType" AS ENUM ('TENANT_REPRESENTATIVE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SignatureCaptureMethod" AS ENUM ('STORED_SIGNATURE', 'DRAWN', 'UPLOADED');

-- CreateEnum
CREATE TYPE "SignatureSource" AS ENUM ('COMPANY_PROFILE', 'STAFF_DEVICE', 'CUSTOMER_PORTAL');

-- AlterTable
ALTER TABLE "document_files" ADD COLUMN     "sha256" TEXT;

-- CreateTable
CREATE TABLE "tenant_signatures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "representativeName" TEXT NOT NULL,
    "representativeTitle" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "method" "SignatureCaptureMethod" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenant_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signature_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "signerType" "SignatureSignerType" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT,
    "signerEmail" TEXT,
    "method" "SignatureCaptureMethod" NOT NULL,
    "source" "SignatureSource" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedByUserId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_signature_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_signatures_tenantId_deletedAt_idx" ON "tenant_signatures"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "document_signature_evidence_tenantId_documentId_idx" ON "document_signature_evidence"("tenantId", "documentId");

-- AddForeignKey
ALTER TABLE "tenant_signatures" ADD CONSTRAINT "tenant_signatures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_evidence" ADD CONSTRAINT "document_signature_evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_evidence" ADD CONSTRAINT "document_signature_evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature_evidence" ADD CONSTRAINT "document_signature_evidence_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
