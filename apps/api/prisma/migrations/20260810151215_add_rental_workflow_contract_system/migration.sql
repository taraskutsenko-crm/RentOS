-- AlterTable
ALTER TABLE "document_templates" ADD COLUMN     "language" TEXT;

-- AlterTable
ALTER TABLE "document_versions" ADD COLUMN     "templateVersionId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "taxNumber" TEXT;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "document_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Document-language independence (D-057's named-but-declined path, now in
-- scope): the "at most one ACTIVE template per (tenantId, documentType)"
-- invariant (see 20260731171918_add_document_rendering_platform) becomes
-- "at most one ACTIVE template per (tenantId, documentType, language)".
-- Postgres treats every NULL as distinct for uniqueness purposes, which
-- exactly matches the desired semantics here: multiple ACTIVE templates
-- with language IS NULL would NOT be blocked by a plain unique index, so
-- language is coalesced to '' only inside this partial index's expression
-- to give every tenant's pre-existing (language-less) template a single
-- shared "no language set" bucket, matching its pre-migration behavior.
DROP INDEX "document_templates_one_active_per_type";

CREATE UNIQUE INDEX "document_templates_one_active_per_type_language"
  ON "document_templates" ("tenantId", "documentType", COALESCE("language", ''))
  WHERE "status" = 'ACTIVE';
