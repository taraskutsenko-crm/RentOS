-- CreateEnum
CREATE TYPE "AssetFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTISELECT', 'URL', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "AssetDocumentType" AS ENUM ('PURCHASE_DOCUMENT', 'MANUAL', 'CERTIFICATE', 'INSURANCE', 'REGISTRATION', 'INSPECTION', 'OTHER');

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_status_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "colorToken" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailableForRental" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "currentStatusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internalNumber" TEXT NOT NULL,
    "sku" TEXT,
    "serialNumber" TEXT,
    "barcode" TEXT,
    "qrCodeValue" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "description" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchasePriceMinor" INTEGER,
    "purchaseCurrency" VARCHAR(3),
    "replacementValueMinor" INTEGER,
    "replacementCurrency" VARCHAR(3),
    "currentLocationText" TEXT,
    "conditionNotes" TEXT,
    "isRentable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_status_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_location_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "previousLocation" TEXT,
    "newLocation" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_location_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_custom_field_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "fieldType" "AssetFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "validationRules" JSONB,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_custom_field_values" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_images" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "altText" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "documentType" "AssetDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_categories_tenantId_parentId_name_idx" ON "asset_categories"("tenantId", "parentId", "name");

-- CreateIndex
CREATE INDEX "asset_categories_tenantId_deletedAt_idx" ON "asset_categories"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "asset_status_definitions_tenantId_isActive_idx" ON "asset_status_definitions"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "asset_status_definitions_tenantId_code_key" ON "asset_status_definitions"("tenantId", "code");

-- CreateIndex
CREATE INDEX "assets_tenantId_categoryId_idx" ON "assets"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "assets_tenantId_currentStatusId_idx" ON "assets"("tenantId", "currentStatusId");

-- CreateIndex
CREATE INDEX "assets_tenantId_deletedAt_idx" ON "assets"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "assets_tenantId_isActive_idx" ON "assets"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "assets_tenantId_manufacturer_idx" ON "assets"("tenantId", "manufacturer");

-- CreateIndex
CREATE INDEX "assets_tenantId_model_idx" ON "assets"("tenantId", "model");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_internalNumber_key" ON "assets"("tenantId", "internalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_sku_key" ON "assets"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_serialNumber_key" ON "assets"("tenantId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_barcode_key" ON "assets"("tenantId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenantId_qrCodeValue_key" ON "assets"("tenantId", "qrCodeValue");

-- CreateIndex
CREATE INDEX "asset_status_history_tenantId_assetId_createdAt_idx" ON "asset_status_history"("tenantId", "assetId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_location_history_tenantId_assetId_createdAt_idx" ON "asset_location_history"("tenantId", "assetId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_custom_field_definitions_tenantId_fieldType_idx" ON "asset_custom_field_definitions"("tenantId", "fieldType");

-- CreateIndex
CREATE INDEX "asset_custom_field_definitions_tenantId_categoryId_deletedA_idx" ON "asset_custom_field_definitions"("tenantId", "categoryId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "asset_custom_field_definitions_tenantId_categoryId_key_key" ON "asset_custom_field_definitions"("tenantId", "categoryId", "key");

-- CreateIndex
CREATE INDEX "asset_custom_field_values_tenantId_fieldDefinitionId_idx" ON "asset_custom_field_values"("tenantId", "fieldDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_custom_field_values_assetId_fieldDefinitionId_key" ON "asset_custom_field_values"("assetId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "asset_images_tenantId_assetId_deletedAt_idx" ON "asset_images"("tenantId", "assetId", "deletedAt");

-- CreateIndex
CREATE INDEX "asset_documents_tenantId_assetId_deletedAt_idx" ON "asset_documents"("tenantId", "assetId", "deletedAt");

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_definitions" ADD CONSTRAINT "asset_status_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentStatusId_fkey" FOREIGN KEY ("currentStatusId") REFERENCES "asset_status_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "asset_status_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "asset_status_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_location_history" ADD CONSTRAINT "asset_location_history_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_location_history" ADD CONSTRAINT "asset_location_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_location_history" ADD CONSTRAINT "asset_location_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custom_field_definitions" ADD CONSTRAINT "asset_custom_field_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custom_field_definitions" ADD CONSTRAINT "asset_custom_field_definitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custom_field_values" ADD CONSTRAINT "asset_custom_field_values_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custom_field_values" ADD CONSTRAINT "asset_custom_field_values_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_custom_field_values" ADD CONSTRAINT "asset_custom_field_values_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "asset_custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_images" ADD CONSTRAINT "asset_images_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_images" ADD CONSTRAINT "asset_images_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_images" ADD CONSTRAINT "asset_images_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_documents" ADD CONSTRAINT "asset_documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense-in-depth: at most one non-deleted primary image per asset. The
-- application (AssetFilesService) already enforces this transactionally by
-- unsetting any prior primary image, but a partial unique index guarantees
-- it can never be violated even by a bug or concurrent write.
CREATE UNIQUE INDEX "asset_images_one_primary_per_asset" ON "asset_images"("assetId") WHERE "isPrimary" = true AND "deletedAt" IS NULL;
