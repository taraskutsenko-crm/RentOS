-- Prevents two Customer rows in the same tenant from both having an
-- activated portal account under the same email — such a pair would make
-- portal login by (tenantSlug, email) ambiguous (Customer.email is
-- otherwise optional and not unique). Invitations that have not yet been
-- activated do not conflict; only rows with portalActivatedAt set are
-- constrained. Hand-appended raw SQL, mirroring the
-- document_templates_one_active_per_type precedent (see
-- 20260731171918_add_document_rendering_platform).
CREATE UNIQUE INDEX "customers_one_portal_account_per_email" ON "customers" ("tenantId", "email") WHERE "portalActivatedAt" IS NOT NULL AND "email" IS NOT NULL;
