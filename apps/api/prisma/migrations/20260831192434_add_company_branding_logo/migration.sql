-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "logoChecksumSha256" TEXT,
ADD COLUMN     "logoHeight" INTEGER,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoOriginalFileName" TEXT,
ADD COLUMN     "logoSizeBytes" INTEGER,
ADD COLUMN     "logoStorageKey" TEXT,
ADD COLUMN     "logoUploadedAt" TIMESTAMP(3),
ADD COLUMN     "logoUploadedByUserId" TEXT,
ADD COLUMN     "logoWidth" INTEGER;
