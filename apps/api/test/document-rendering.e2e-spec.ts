import { unlinkSync } from "node:fs";
import { resolve } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DOCUMENT_VARIABLE_PATHS } from "../src/documents/rendering/document-variable-registry";
import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

// A minimal valid 1x1 PNG — just enough bytes for StorageService.validateImage
// and an actual image/png upload; the pixel content itself is irrelevant to
// every test that uses it.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("Document Rendering, Templates, Sharing, Email, Signature E2E (TASK-0008 Part 2)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    tenantId = body.tenant.id;
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;
  });

  function createDocument(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, title: "Rental contract", ...overrides });
  }

  function createTemplate(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .send({
        documentType: "CONTRACT",
        name: "Custom Contract Template",
        htmlContent:
          '<div class="doc-page"><h1>{{document.title}}</h1><p>{{customer.name}}</p></div>',
        ...overrides,
      });
  }

  async function registerSecondTenant() {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = response.body as RegisterResponseBody;
    const otherCookie = extractCookie(response.headers, "rentos_access_token");
    return { tenantId: otherBody.tenant.id, cookie: otherCookie };
  }

  async function createMemberWithRole(role: string, email: string) {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName: `${role} Co` })
      .expect(201);
    const memberBody = registerResponse.body as RegisterResponseBody;
    const memberCookie = extractCookie(registerResponse.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: memberBody.user.id, role: role as never, status: "ACTIVE" },
    });
    return memberCookie;
  }

  // ---------------------------------------------------------------------
  // Template engine (Part 1)
  // ---------------------------------------------------------------------

  it("creates a DRAFT template with version 1", async () => {
    const response = await createTemplate().expect(201);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.currentVersionNumber).toBe(1);
    expect(response.body.versions).toHaveLength(1);
    expect(response.body.versions[0].htmlContent).toContain("{{customer.name}}");
  });

  it("creates a new immutable version on every content edit", async () => {
    const created = await createTemplate().expect(201);
    const updated = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/versions`)
      .set("Cookie", accessCookie)
      .send({ htmlContent: "<div>v2 content {{customer.name}}</div>" })
      .expect(201);

    expect(updated.body.currentVersionNumber).toBe(2);
    expect(updated.body.versions).toHaveLength(2);
    const v1 = updated.body.versions.find((v: { versionNumber: number }) => v.versionNumber === 1);
    expect(v1.htmlContent).toContain("{{document.title}}");
  });

  it("restores a previous version by creating a new version with the old content", async () => {
    const created = await createTemplate().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/versions`)
      .set("Cookie", accessCookie)
      .send({ htmlContent: "<div>v2</div>" })
      .expect(201);

    const restored = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/versions/1/restore`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(restored.body.currentVersionNumber).toBe(3);
    const v3 = restored.body.versions.find((v: { versionNumber: number }) => v.versionNumber === 3);
    expect(v3.htmlContent).toContain("{{document.title}}");
  });

  it("activates a template, demoting any previously-active template of the same type to DRAFT", async () => {
    const templateA = await createTemplate({ name: "Template A" }).expect(201);
    const templateB = await createTemplate({ name: "Template B" }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateA.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const activateB = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateB.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(activateB.body.status).toBe("ACTIVE");

    const refreshedA = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates/${templateA.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(refreshedA.body.status).toBe("DRAFT");
  });

  it("allows an ACTIVE template per (documentType, language) — activating one language never demotes another", async () => {
    const templateEn = await createTemplate({ name: "English Contract", language: "en" }).expect(
      201,
    );
    const templateEs = await createTemplate({ name: "Spanish Contract", language: "es" }).expect(
      201,
    );

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEn.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEs.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const refreshedEn = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates/${templateEn.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(refreshedEn.body.status).toBe("ACTIVE");

    const languages = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates/active-languages?documentType=CONTRACT`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(languages.body.languages.sort()).toEqual(["en", "es"]);
  });

  it("activating a template still demotes a previously-active template in the same language bucket", async () => {
    const templateEn1 = await createTemplate({ name: "English Contract 1", language: "en" }).expect(
      201,
    );
    const templateEn2 = await createTemplate({ name: "English Contract 2", language: "en" }).expect(
      201,
    );

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEn1.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    // Activating the second same-language template demotes the first —
    // exactly the intra-bucket demotion behavior, proving the uniqueness
    // scope is truly (documentType, language) and not just documentType.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEn2.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const refreshedEn1 = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates/${templateEn1.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(refreshedEn1.body.status).toBe("DRAFT");
  });

  it("picks the requested templateLanguage when creating a document, resolves the tenant's default language when none is given, and falls back to the built-in default only when even that isn't active", async () => {
    const templateEn = await createTemplate({
      name: "English Contract",
      language: "en",
      htmlContent: "<div>EN: {{customer.name}}</div>",
    }).expect(201);
    const templateEs = await createTemplate({
      name: "Spanish Contract",
      language: "es",
      htmlContent: "<div>ES: {{customer.name}}</div>",
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEn.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEs.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const spanishDoc = await createDocument({ templateLanguage: "es" }).expect(201);
    const spanishPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${spanishDoc.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(spanishPreview.body.html).toContain("ES: Jane Doe");

    // No templateLanguage given, but the test tenant's resolved default
    // document language (its country code -> "en", see DECISIONS.md D-071)
    // has an ACTIVE template among the 2+ candidates — picks it rather than
    // falling back to the generic built-in template (this is the actual
    // fix for the reported RU-UI/PL-company Contract-defaults-to-English
    // bug: never guessing among the 2+, but also never ignoring a genuine,
    // resolvable default).
    const defaultDoc = await createDocument().expect(201);
    const defaultPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${defaultDoc.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(defaultPreview.body.templateSource).toBe("tenant_active");
    expect(defaultPreview.body.html).toContain("EN: Jane Doe");

    // Archive the resolved-default (EN) template too — now genuinely
    // ambiguous (ES only, doesn't match the resolved default) with no
    // usable default, so the original "don't guess" fallback still holds.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateEn.body.id}/archive`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const templateFr = await createTemplate({
      name: "French Contract",
      language: "fr",
      htmlContent: "<div>FR: {{customer.name}}</div>",
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templateFr.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const ambiguousDoc = await createDocument().expect(201);
    const ambiguousPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${ambiguousDoc.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(ambiguousPreview.body.templateSource).toBe("built_in_default");
  });

  it("archives and restores a template", async () => {
    const created = await createTemplate().expect(201);
    const archived = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/archive`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(archived.body.status).toBe("ARCHIVED");

    const restored = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/restore`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(restored.body.status).toBe("DRAFT");
  });

  it("duplicates a template with a fresh DRAFT copy", async () => {
    const created = await createTemplate({ name: "Original" }).expect(201);
    const duplicated = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${created.body.id}/duplicate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(duplicated.body.name).toBe("Original (copy)");
    expect(duplicated.body.status).toBe("DRAFT");
    expect(duplicated.body.id).not.toBe(created.body.id);
  });

  it("rejects cross-tenant template access", async () => {
    const created = await createTemplate().expect(201);
    const other = await registerSecondTenant();
    await request(app.getHttpServer())
      .get(`/tenants/${other.tenantId}/document-templates/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(404);
  });

  // ---------------------------------------------------------------------
  // Draft preview against synthetic sample data (task #280) — lets the
  // no-code builder preview unsaved content before any real Document
  // exists, using the same resolveVariables substitution engine as a real
  // render.
  // ---------------------------------------------------------------------

  it("renders unsaved draft HTML against synthetic sample data, using the real tenant's company name", async () => {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/preview`)
      .set("Cookie", accessCookie)
      .send({
        documentType: "CONTRACT",
        htmlContent: "<h1>{{company.name}}</h1><p>{{customer.name}}</p><p>{{today}}</p>",
      })
      .expect(201);

    expect(response.body.html).toContain(validRegisterPayload.companyName);
    expect(response.body.html).not.toContain("{{");
  });

  it("every path in DOCUMENT_VARIABLE_PATHS resolves to non-empty synthetic content in a draft preview", async () => {
    // registrationNumber/taxNumber/address/phone are nullable Tenant
    // columns that are empty by default on a freshly-registered tenant
    // (correctly so) — set them here so this "every path" coverage test
    // matches how the equivalent real-render coverage test below already
    // populates the tenant before asserting non-empty output.
    // UpdateTenantDto requires the full form on every submit, so `name`
    // must be resent too even though it's already non-empty.
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({
        name: validRegisterPayload.companyName,
        timezone: "America/New_York",
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
        email: "office@acme-rentals.example",
      })
      .expect(200);

    const markers = DOCUMENT_VARIABLE_PATHS.map(
      (varPath) => `<div>${varPath}::{{${varPath}}}::end</div>`,
    ).join("");
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/preview`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", htmlContent: markers })
      .expect(201);

    // company.logo is permanently hardcoded to "" in the resolver (no
    // tenant branding field exists yet) — same documented exception as the
    // real-render coverage test below. company.email now resolves from
    // Tenant.email (set above), so it is no longer in this set. The
    // signature.* fields (Havelio Signature System) are only ever
    // populated once real DocumentSignatureEvidence exists for a document
    // — neither a template preview nor this test's document has captured
    // any, so they stay empty by design, exactly like company.logo before
    // a branding field exists.
    const permanentlyEmpty = new Set([
      "company.logo",
      "company.logoHtml",
      "signature.companySignatureImageHtml",
      "signature.companySignerName",
      "signature.companySignerTitle",
      "signature.companySignedAt",
      "signature.companySignedAtLabel",
      "signature.customerSignatureImageHtml",
      "signature.customerSignerName",
      "signature.customerSignedAt",
      "signature.customerSignedAtLabel",
    ]);
    for (const varPath of DOCUMENT_VARIABLE_PATHS) {
      const match = new RegExp(`${varPath.replace(/\./g, "\\.")}::(.*?)::end`, "s").exec(
        response.body.html,
      );
      expect(match, `path "${varPath}" did not appear in rendered output`).not.toBeNull();
      if (permanentlyEmpty.has(varPath)) continue;
      expect(match![1]!.trim(), `path "${varPath}" resolved to empty content`).not.toBe("");
    }
  });

  it("allows a VIEWER (documents.templates.view only) to preview, but blocks a role with neither view nor manage", async () => {
    const viewerCookie = await createMemberWithRole("VIEWER", "viewer-preview@example.com");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/preview`)
      .set("Cookie", viewerCookie)
      .send({ documentType: "CONTRACT", htmlContent: "<p>{{customer.name}}</p>" })
      .expect(201);

    const technicianCookie = await createMemberWithRole("TECHNICIAN", "tech-preview@example.com");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/preview`)
      .set("Cookie", technicianCookie)
      .send({ documentType: "CONTRACT", htmlContent: "<p>{{customer.name}}</p>" })
      .expect(403);
  });

  it("rejects a draft preview missing required fields", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/preview`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT" })
      .expect(400);
  });

  // ---------------------------------------------------------------------
  // Variable resolution + rendering (Parts 2-3)
  // ---------------------------------------------------------------------

  it("renders the built-in default template when no tenant template is active", async () => {
    const created = await createDocument({ businessData: { notes: "Handle with care" } }).expect(
      201,
    );
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.templateSource).toBe("built_in_default");
    expect(preview.body.html).toContain("Jane Doe");
    expect(preview.body.html).toContain(created.body.documentNumber);
    expect(preview.body.html).toContain("Handle with care");
  });

  it("built-in default CONTRACT template renders all 18 sections", async () => {
    const created = await createDocument().expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    const expectedSections = [
      "Rental Contract", // 1. Title
      "Parties", // 2.
      "Subject of the Contract", // 3.
      "Rental Period", // 4.
      "Price", // 5.
      "Payment Terms", // 6.
      "Delivery and Handover", // 7.
      "Return", // 8.
      "Customer Responsibilities", // 9.
      "Damage and Loss", // 10.
      "Late Return", // 11.
      "Non-Payment", // 12.
      "Termination", // 13.
      "Additional Costs", // 14.
      "Notices", // 15.
      "Applicable Terms and Jurisdiction", // 16.
      "Additional Conditions", // 17.
      // 18. Signatures — rendered by the shared documentShell, checked separately below.
    ];
    for (const section of expectedSections) {
      expect(preview.body.html).toContain(section);
    }
    expect(preview.body.html).toContain("doc-signature-block");
  });

  // A direct Rental->Commercial Offer document (no source Quote at all) must
  // never render empty — see docs/DECISIONS.md (Commercial Offer from
  // Rental fix). Proves the built-in QUOTE template pulls real customer/
  // asset/period/price data straight from rental.* when there is no
  // backing Quote object to supply quote.*.
  it("built-in default QUOTE (Commercial Offer) template is fully populated when generated directly from a Rental with no source Quote", async () => {
    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Skoda Fabia", "SK977UG");

    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: "2027-01-10T00:00:00.000Z",
        plannedEnd: "2027-01-14T00:00:00.000Z",
        discountMinor: 500,
        items: [
          {
            assetId,
            billingMode: "DAILY",
            dailyPriceMinor: 5000,
            depositMinor: 70000,
            taxRateBp: 2300,
          },
        ],
      })
      .expect(201);
    expect(rental.body.sourceQuoteId).toBeNull();

    const document = await createDocument({
      documentType: "QUOTE",
      customerId,
      rentalId: rental.body.id,
    }).expect(201);
    expect(document.body.quoteId).toBeNull();

    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Jane Doe");
    expect(preview.body.html).toContain("Skoda Fabia");
    // subtotal 200.00 (4 days x 50.00), tax 46.00 (23% of the 200.00 taxable
    // base), rental-level discount 5.00 applied after tax: 200 - 5 + 46 = 241.00
    expect(preview.body.html).toContain("$241.00");
    expect(preview.body.html).toContain("$46.00"); // tax
    expect(preview.body.html).toContain("$5.00"); // discount
    expect(preview.body.html).toContain("$700.00"); // deposit
  });

  // Regression: Handover/Return Protocols previously had no UI path that
  // ever populated condition/damage notes at all — businessData.notes and
  // businessData.conditionNotes are real, tenant-scoped, persisted domain
  // data (DocumentVersion.businessDataSnapshot), retrievable after reload
  // and rendered into the document — see DECISIONS.md, condition notes fix.
  it("built-in HANDOVER_PROTOCOL and RETURN_PROTOCOL templates render persisted condition/damage notes", async () => {
    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Generator A", "GEN-0001");

    const handover = await createDocument({
      documentType: "HANDOVER_PROTOCOL",
      assetId,
      businessData: {
        notes: "General handover notes",
        conditionNotes: {
          assetCondition: "Fully functional, minor scratches on the casing",
          damageDescription: "Pre-existing dent on the left side panel",
        },
      },
    }).expect(201);
    const handoverPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${handover.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(handoverPreview.body.html).toContain("General handover notes");
    expect(handoverPreview.body.html).toContain("Fully functional, minor scratches on the casing");
    expect(handoverPreview.body.html).toContain("Pre-existing dent on the left side panel");

    const returnDoc = await createDocument({
      documentType: "RETURN_PROTOCOL",
      assetId,
      businessData: {
        notes: "General return notes",
        conditionNotes: {
          assetCondition: "Returned in working order",
          damageDescription: "New crack on the rear housing",
          missingItems: "Power cable not returned",
        },
      },
    }).expect(201);
    const returnPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${returnDoc.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(returnPreview.body.html).toContain("General return notes");
    expect(returnPreview.body.html).toContain("Returned in working order");
    expect(returnPreview.body.html).toContain("New crack on the rear housing");
    expect(returnPreview.body.html).toContain("Power cable not returned");

    // The persisted data survives a reload — reading the document back
    // directly must return the exact same structured business data, not
    // only whatever happened to be baked into the last rendered HTML.
    const reloaded = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${returnDoc.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const currentVersion = reloaded.body.versions.find(
      (v: { versionNumber: number }) => v.versionNumber === reloaded.body.currentVersionNumber,
    );
    expect(currentVersion.businessDataSnapshot.conditionNotes.missingItems).toBe(
      "Power cable not returned",
    );
  });

  it("renders the tenant's ACTIVE template instead of the built-in default once one is activated", async () => {
    const template = await createTemplate({
      name: "Branded Contract",
      htmlContent: "<div>BRANDED: {{customer.name}}</div>",
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${template.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const created = await createDocument().expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.templateSource).toBe("tenant_active");
    expect(preview.body.html).toContain("BRANDED: Jane Doe");
  });

  it("pins a document version to the template version active at creation time — editing the template afterward never changes an already-generated document", async () => {
    const template = await createTemplate({
      name: "Branded Contract",
      htmlContent: "<div>V1: {{customer.name}}</div>",
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${template.body.id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const created = await createDocument().expect(201);
    const beforeEdit = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(beforeEdit.body.html).toContain("V1: Jane Doe");

    // The template stays ACTIVE while gaining a new version — the exact
    // "edit an active template" scenario the pin exists to protect against.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${template.body.id}/versions`)
      .set("Cookie", accessCookie)
      .send({ htmlContent: "<div>V2: {{customer.name}}</div>" })
      .expect(201);

    const afterEdit = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(afterEdit.body.html).toContain("V1: Jane Doe");
    expect(afterEdit.body.html).not.toContain("V2:");

    // A document created after the template edit follows the new version.
    const createdAfter = await createDocument().expect(201);
    const afterEditPreview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${createdAfter.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(afterEditPreview.body.html).toContain("V2: Jane Doe");

    // A correction version (createVersion) is a new authoring event and
    // picks up whatever is active now, same as a fresh create.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/versions`)
      .set("Cookie", accessCookie)
      .send({ reason: "correction" })
      .expect(201);
    const afterCorrection = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(afterCorrection.body.html).toContain("V2: Jane Doe");
  });

  it("HTML-escapes resolved variable values in the rendered output (no XSS injection)", async () => {
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({
        documentType: "CUSTOM",
        customTypeName: "Note",
        title: "<script>alert(1)</script>",
        businessData: {},
      })
      .expect(201);

    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).not.toContain("<script>alert(1)</script>");
    expect(preview.body.html).toContain("&lt;script&gt;");
  });

  it("generates a PDF, storing it as a DocumentFile tied to the current version, and reuses it on subsequent GETs", async () => {
    const created = await createDocument().expect(201);

    const first = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(
      Buffer.from(first.body as Buffer)
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const pdfFiles = detail.body.versions[0].files.filter(
      (f: { format: string }) => f.format === "PDF",
    );
    expect(pdfFiles).toHaveLength(1);

    // Second GET must not create a second DocumentFile row.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);
    const detail2 = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const pdfFiles2 = detail2.body.versions[0].files.filter(
      (f: { format: string }) => f.format === "PDF",
    );
    expect(pdfFiles2).toHaveLength(1);
  }, 30000);

  it("forces a fresh PDF file on POST .../pdf (regeneration)", async () => {
    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const pdfFiles = detail.body.versions[0].files.filter(
      (f: { format: string }) => f.format === "PDF",
    );
    expect(pdfFiles).toHaveLength(2);
  }, 30000);

  // ---------------------------------------------------------------------
  // Public sharing (Part 4)
  // ---------------------------------------------------------------------

  it("creates a share link and allows public, unauthenticated viewing and PDF download", async () => {
    const created = await createDocument().expect(201);

    const shareResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const token = shareResponse.body.token as string;
    expect(token).toBeTruthy();

    const viewResponse = await request(app.getHttpServer())
      .post(`/public/documents/${token}/view`)
      .send({})
      .expect(201);
    expect(viewResponse.body.documentNumber).toBe(created.body.documentNumber);
    expect(viewResponse.body.html).toContain("Jane Doe");

    const pdfResponse = await request(app.getHttpServer())
      .post(`/public/documents/${token}/pdf`)
      .send({})
      .expect(201);
    expect(
      Buffer.from(pdfResponse.body as Buffer)
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  }, 30000);

  it("increments view and download counters and logs IP/user-agent", async () => {
    const created = await createDocument().expect(201);
    const shareResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const token = shareResponse.body.token as string;

    await request(app.getHttpServer()).post(`/public/documents/${token}/view`).send({}).expect(201);
    await request(app.getHttpServer()).post(`/public/documents/${token}/view`).send({}).expect(201);
    await request(app.getHttpServer()).post(`/public/documents/${token}/pdf`).send({}).expect(201);

    const links = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(links.body[0].viewCount).toBe(2);
    expect(links.body[0].downloadCount).toBe(1);
    expect(links.body[0].lastAccessedIp).toBeTruthy();
  }, 30000);

  it("triggers the SENT -> VIEWED transition on the first public view", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const shareResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/public/documents/${shareResponse.body.token}/view`)
      .send({})
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(detail.body.status).toBe("VIEWED");
  });

  it("requires the correct password for a password-protected share link", async () => {
    const created = await createDocument().expect(201);
    const shareResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({ password: "sesame123" })
      .expect(201);
    const token = shareResponse.body.token as string;

    await request(app.getHttpServer()).post(`/public/documents/${token}/view`).send({}).expect(403);
    await request(app.getHttpServer())
      .post(`/public/documents/${token}/view`)
      .send({ password: "wrong-password" })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/public/documents/${token}/view`)
      .send({ password: "sesame123" })
      .expect(201);
  });

  it("returns 404 for a disabled or unknown share token", async () => {
    const created = await createDocument().expect(201);
    const shareResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const { id: shareLinkId, token } = {
      id: shareResponse.body.shareLink.id,
      token: shareResponse.body.token,
    };

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${created.body.id}/share/${shareLinkId}`)
      .set("Cookie", accessCookie)
      .expect(204);

    await request(app.getHttpServer()).post(`/public/documents/${token}/view`).send({}).expect(404);
    await request(app.getHttpServer())
      .post(`/public/documents/unknown-token/view`)
      .send({})
      .expect(404);
  });

  it("regenerating a share link disables the previous one", async () => {
    const created = await createDocument().expect(201);
    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(first.body.token).not.toBe(second.body.token);
    await request(app.getHttpServer())
      .post(`/public/documents/${first.body.token}/view`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`/public/documents/${second.body.token}/view`)
      .send({})
      .expect(201);
  });

  // ---------------------------------------------------------------------
  // Email delivery (Part 5)
  // ---------------------------------------------------------------------

  // No real email transport is configured in this test environment (see
  // LoggingEmailProvider) — the delivery must truthfully report
  // NOT_CONFIGURED, never a fabricated SENT (see DECISIONS.md, email
  // truthfulness fix).
  it("records a delivery as NOT_CONFIGURED — never fakes SENT — when no real email provider is configured", async () => {
    const created = await createDocument().expect(201);
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOMER", subject: "Your contract" })
      .expect(201);

    expect(response.body.status).toBe("NOT_CONFIGURED");
    expect(response.body.recipientEmail).toBe("jane@example.com");
    expect(response.body.sentAt).toBeNull();
    expect(response.body.errorMessage).toBeTruthy();
  }, 30000);

  it("rejects sending to CUSTOMER when the customer has no email on file", async () => {
    const noEmailCustomer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "No", lastName: "Email" })
      .expect(201);
    const created = await createDocument({ customerId: noEmailCustomer.body.id }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOMER", subject: "Your contract" })
      .expect(400);
  });

  it("sends to a CUSTOM email address", async () => {
    const created = await createDocument().expect(201);
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOM", customEmail: "someone@example.com", subject: "Doc" })
      .expect(201);
    expect(response.body.recipientEmail).toBe("someone@example.com");
  }, 30000);

  it("retries a delivery, creating a new delivery row with the same recipient/subject", async () => {
    const created = await createDocument().expect(201);
    const sent = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOMER", subject: "Your contract" })
      .expect(201);

    const retried = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email/${sent.body.id}/retry`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(retried.body.id).not.toBe(sent.body.id);
    expect(retried.body.recipientEmail).toBe("jane@example.com");
    expect(retried.body.subject).toBe("Your contract");

    const history = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(history.body).toHaveLength(2);
  }, 30000);

  // Email-delivery diagnosis task — real-world regression: a captured
  // signature's evidence row can outlive its underlying storage object
  // (e.g. a storage-backend migration that didn't carry an older file
  // forward — see DECISIONS.md). Before this fix, VariableResolverService.
  // buildSignatureImageHtml threw uncaught for a missing object, which
  // propagated all the way out of every renderer of that document
  // (preview/PDF/email) as an unhandled 500. It must now degrade to an
  // empty image instead — the render still succeeds, and the signer name
  // (which comes from the evidence row, not storage) still appears.
  it("a document whose signature image is missing from storage still renders (degrades to no image) instead of throwing", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/company-signature`)
      .set("Cookie", accessCookie)
      .field("representativeName", "Taras Kutsenko")
      .field("representativeTitle", "Owner")
      .field("method", "UPLOADED")
      .attach("file", TINY_PNG, { filename: "sig.png", contentType: "image/png" })
      .expect(201);

    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/signatures`)
      .set("Cookie", accessCookie)
      .send({
        signerType: "TENANT_REPRESENTATIVE",
        signerName: "Taras Kutsenko",
        method: "STORED_SIGNATURE",
      })
      .expect(201);

    // Simulate the real production scenario directly: the evidence row
    // exists, but its storage object is gone (e.g. a storage-backend
    // migration gap). Delete the file this test's own local storage
    // backend just wrote, matching apps/api/.env.test's STORAGE_LOCAL_DIR.
    const evidence = await prisma.documentSignatureEvidence.findFirstOrThrow({
      where: { tenantId, documentId: created.body.id, signerType: "TENANT_REPRESENTATIVE" },
    });
    unlinkSync(resolve("./storage-uploads-test", evidence.storageKey));

    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    // The signer's name (from the DB row, not storage) still renders — only
    // the <img> itself is silently absent.
    expect(preview.body.html).toContain("Taras Kutsenko");
    expect(preview.body.html).toContain("doc-signature-block");
  });

  // ---------------------------------------------------------------------
  // E-signature foundation (Part 6)
  // ---------------------------------------------------------------------

  it("requests a signature via LocalMockProvider, resulting in PENDING status", async () => {
    const created = await createDocument().expect(201);
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/signature-requests`)
      .set("Cookie", accessCookie)
      .send({ signerName: "Jane Doe" })
      .expect(201);

    expect(response.body.status).toBe("PENDING");
    expect(response.body.provider).toBe("LOCAL_MOCK");
    expect(response.body.signerEmail).toBe("jane@example.com");
  });

  it("cancels an open signature request", async () => {
    const created = await createDocument().expect(201);
    const requested = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/signature-requests`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(
        `/tenants/${tenantId}/documents/${created.body.id}/signature-requests/${requested.body.id}/cancel`,
      )
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");

    await request(app.getHttpServer())
      .post(
        `/tenants/${tenantId}/documents/${created.body.id}/signature-requests/${requested.body.id}/cancel`,
      )
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Permissions + tenant isolation
  // ---------------------------------------------------------------------

  it("blocks VIEWER from render/share/send/sign/template-management but allows viewing", async () => {
    const created = await createDocument().expect(201);
    const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", viewerCookie)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", viewerCookie)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", viewerCookie)
      .send({ recipientType: "CUSTOMER", subject: "x" })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", viewerCookie)
      .send({ documentType: "CONTRACT", name: "x", htmlContent: "<div></div>" })
      .expect(403);
  });

  it("allows TECHNICIAN to render but blocks template management and sharing", async () => {
    const created = await createDocument().expect(201);
    const techCookie = await createMemberWithRole("TECHNICIAN", "tech@example.com");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
      .set("Cookie", techCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", techCookie)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", techCookie)
      .send({ documentType: "CONTRACT", name: "x", htmlContent: "<div></div>" })
      .expect(403);
  });

  it("logs audit entries for the full share/email/signature lifecycle", async () => {
    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/share`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOMER", subject: "x" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/signature-requests`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, entityType: "Document", entityId: created.body.id },
    });
    const actions = logs.map((log) => log.action);
    expect(actions).toContain("document.shared");
    expect(actions).toContain("document.email_not_configured");
    expect(actions).toContain("document.signature_requested");
  }, 30000);

  // ---------------------------------------------------------------------
  // Variable resolver extensions (Pre-Chapter 10 Part C)
  // ---------------------------------------------------------------------

  const RESOLVER_TEMPLATE_HTML =
    '<div class="doc-page">' +
    "<p>{{company.registrationNumber}}|{{company.taxNumber}}|{{company.address}}|{{company.phone}}</p>" +
    "<p>{{customer.taxNumber}}</p>" +
    "<p>{{rental.startTime}}|{{rental.endTime}}|{{rental.deposit}}</p>" +
    "{{rental.assetsTableHtml}}" +
    "{{quote.servicesTableHtml}}" +
    "</div>";

  async function createAssetCategory() {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Generators" })
      .expect(201);
    return response.body.id as string;
  }

  async function createAsset(categoryId: string, name: string, internalNumber: string) {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name, internalNumber, categoryId })
      .expect(201);
    return response.body.id as string;
  }

  it("resolves company/customer identity fields and rental time/deposit variables", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({
        name: "Acme Rentals",
        timezone: "America/New_York",
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
        email: "office@acme-rentals.example",
      })
      .expect(200);

    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Vat", lastName: "Customer", vatNumber: "DE999999999" })
      .expect(201);

    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Generator A", "GEN-0001");

    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customer.body.id,
        plannedStart: "2027-01-10T09:30:00.000Z",
        plannedEnd: "2027-01-12T17:00:00.000Z",
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 5000, depositMinor: 10000 }],
      })
      .expect(201);

    await createTemplate({ htmlContent: RESOLVER_TEMPLATE_HTML }).expect(201);
    const active = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${active.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const document = await createDocument({
      customerId: customer.body.id,
      rentalId: rental.body.id,
    }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain(
      "HRB 12345|DE123456789|Musterstrasse 1, Berlin|+49 30 1234567",
    );
    expect(preview.body.html).toContain("DE999999999");
    expect(preview.body.html).toContain("$100.00");
    expect(preview.body.html).toContain("Generator A");
  });

  it("resolves rental.start/end/startTime/endTime/startDateTime/endDateTime converted into the tenant's real timezone (D-115, supersedes D-066)", async () => {
    // Rental.plannedStart/plannedEnd are real UTC instants (see
    // docs/DECISIONS.md D-115 — supersedes D-066's "floating naive" model,
    // which read these fields back as literal UTC digits regardless of the
    // tenant's real timezone). The test tenant (validRegisterPayload) is
    // registered with timezone "America/New_York" (EST = UTC-5 in
    // January): a "02:00" UTC instant must now correctly convert to
    // "21:00 the PREVIOUS day" in that zone — every generated contract's
    // rental period must reflect the real instant, not the literal UTC
    // digits. Times are picked close to midnight UTC specifically so the
    // day-boundary conversion is also caught, not just the hour shift.
    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Time", lastName: "Customer" })
      .expect(201);

    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Generator B", "GEN-TZ");

    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customer.body.id,
        plannedStart: "2027-01-10T02:00:00.000Z",
        plannedEnd: "2027-01-12T02:00:00.000Z",
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 5000 }],
      })
      .expect(201);

    await createTemplate({
      htmlContent:
        "<p>{{rental.start}}|{{rental.end}}|{{rental.startTime}}|{{rental.endTime}}|" +
        "{{rental.startDateTime}}|{{rental.endDateTime}}</p>",
    }).expect(201);
    const templates = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templates.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const document = await createDocument({
      customerId: customer.body.id,
      rentalId: rental.body.id,
    }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    // 02:00 UTC minus the EST -5 offset = 21:00 (9 PM) the previous
    // calendar day — the correct tenant-local reading of this real instant.
    expect(preview.body.html).toContain("01/09/2027");
    expect(preview.body.html).toContain("01/11/2027");
    expect(preview.body.html).toContain("09:00 PM");
    // The literal UTC digits (D-066's old, now-incorrect behavior).
    expect(preview.body.html).not.toContain("01/10/2027");
    expect(preview.body.html).not.toContain("01/12/2027");
    expect(preview.body.html).not.toContain("02:00 AM");
  });

  it("builds rental.assetsTableHtml with one row per rental item and empty string when there is no rental", async () => {
    const categoryId = await createAssetCategory();
    const assetAId = await createAsset(categoryId, "Generator A", "GEN-A");
    const assetBId = await createAsset(categoryId, "Ladder B", "LAD-B");

    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: "2027-01-10T09:00:00.000Z",
        plannedEnd: "2027-01-12T09:00:00.000Z",
        items: [
          { assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 5000 },
          { assetId: assetBId, billingMode: "WEEKLY", weeklyPriceMinor: 3000 },
        ],
      })
      .expect(201);

    await createTemplate({ htmlContent: "<div>{{rental.assetsTableHtml}}</div>" }).expect(201);
    const templates = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templates.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const withRental = await createDocument({ customerId, rentalId: rental.body.id }).expect(201);
    const previewWithRental = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${withRental.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(previewWithRental.body.html).toContain("Generator A");
    expect(previewWithRental.body.html).toContain("Ladder B");
    expect(previewWithRental.body.html).toContain("<table");

    const withoutRental = await createDocument({ customerId }).expect(201);
    const previewWithoutRental = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${withoutRental.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(previewWithoutRental.body.html).not.toContain("<table");
  });

  it("renders rental.assetsTableHtml labels and money in the company-country language, never the tenant's UI-adjacent defaultLanguage (regression — bug found during PRE-CHAPTER-10 manual verification)", async () => {
    // A Polish company staffed by a Russian-speaking user: defaultLanguage
    // was previously used directly for this content, leaking Russian table
    // headers into an otherwise English/company-country-language document.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "PL", defaultLanguage: "ru" },
    });

    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Generator A", "GEN-PL");
    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: "2027-01-10T09:00:00.000Z",
        plannedEnd: "2027-01-12T09:00:00.000Z",
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 5000 }],
      })
      .expect(201);

    await createTemplate({ htmlContent: "<div>{{rental.assetsTableHtml}}</div>" }).expect(201);
    const templates = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templates.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const document = await createDocument({ customerId, rentalId: rental.body.id }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    // Polish (from countryCode: "PL"), not Russian (tenant.defaultLanguage).
    expect(preview.body.html).toContain("Sprzęt");
    expect(preview.body.html).toContain("Ilość");
    expect(preview.body.html).toContain("Cena jednostkowa");
    expect(preview.body.html).not.toContain("Оборудование");
    expect(preview.body.html).not.toContain("Кол-во");
  });

  it("renders the entire built-in Contract body in Polish for a Poland-country tenant with no custom template active — not just table labels (regression — bug found during a later manual verification pass, see DECISIONS.md D-077)", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "PL", defaultLanguage: "ru" },
    });

    const document = await createDocument({ customerId, documentType: "CONTRACT" }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    // Real authored Polish prose in the section titles and clause bodies,
    // not merely the resolver-driven table labels covered above.
    expect(preview.body.html).toContain("Umowa najmu");
    expect(preview.body.html).toContain("Strony");
    expect(preview.body.html).toContain("Warunki płatności");
    expect(preview.body.html).toContain("Dostawa i wydanie");
    expect(preview.body.html).toContain("Obowiązki Najemcy");
    // The previously-shipped English body must not leak through (raw HTML
    // is title-case -- "Parties", not the CSS text-transform: uppercase
    // visual rendering "PARTIES" a browser shows).
    expect(preview.body.html).not.toContain(">Parties<");
    expect(preview.body.html).not.toContain("Payment Terms");
    expect(preview.body.html).not.toContain("Delivery and Handover");
    expect(preview.body.html).not.toContain("Customer Responsibilities");
    // And the UI-adjacent tenant.defaultLanguage (ru) must not leak either.
    expect(preview.body.html).not.toContain("Стороны");
  });

  it("renders the entire built-in Handover Protocol body in Polish for a Poland-country tenant with no custom template active", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "PL", defaultLanguage: "ru" },
    });

    const document = await createDocument({
      customerId,
      documentType: "HANDOVER_PROTOCOL",
    }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Protokół wydania");
    expect(preview.body.html).toContain("Stan sprzętu odnotowany przy wydaniu");
    expect(preview.body.html).toContain("Uwagi");
    expect(preview.body.html).not.toContain("Handover Protocol");
    expect(preview.body.html).not.toContain("Condition recorded at handover");
  });

  it("renders the entire built-in Return Protocol body in Polish for a Poland-country tenant with no custom template active", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "PL", defaultLanguage: "ru" },
    });

    const document = await createDocument({
      customerId,
      documentType: "RETURN_PROTOCOL",
    }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Protokół zwrotu");
    expect(preview.body.html).toContain("Stan sprzętu odnotowany przy zwrocie");
    expect(preview.body.html).not.toContain("Return Protocol");
    expect(preview.body.html).not.toContain("Condition recorded at return");
  });

  it("renders the entire built-in Commercial Offer (QUOTE) body in Polish for a Poland-country tenant with no custom template active", async () => {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "PL", defaultLanguage: "ru" },
    });

    const document = await createDocument({ customerId, documentType: "QUOTE" }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Oferta handlowa");
    expect(preview.body.html).not.toContain("Commercial Offer");
  });

  it("falls back to the English built-in template for a language with no authored content, rather than mixing in an unfinished translation", async () => {
    // German has no authored PL_STRINGS-style entry in TEMPLATES_BY_LANGUAGE
    // yet -- getDefaultTemplate must fall back to the honest English
    // original, never a half-translated or fabricated body.
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { countryCode: "DE", defaultLanguage: "de" },
    });

    const document = await createDocument({ customerId, documentType: "CONTRACT" }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Rental Contract");
    expect(preview.body.html).toContain(">Parties<");
  });

  it("builds quote.servicesTableHtml from non-ASSET quote items only, escaping cell content", async () => {
    const categoryId = await createAssetCategory();
    const assetId = await createAsset(categoryId, "Generator A", "GEN-Q");

    const quote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        validUntil: "2027-02-01T00:00:00.000Z",
        plannedStart: "2027-01-10T00:00:00.000Z",
        plannedEnd: "2027-01-12T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId,
            name: "Generator A",
            billingMode: "DAILY",
            dailyPriceMinor: 5000,
          },
          {
            itemType: "SERVICE",
            name: '<img src=x onerror="alert(1)">',
            billingMode: "FLAT",
            unitPriceMinor: 2000,
            quantity: 1,
          },
        ],
      })
      .expect(201);

    await createTemplate({ htmlContent: "<div>{{quote.servicesTableHtml}}</div>" }).expect(201);
    const templates = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templates.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const document = await createDocument({ customerId, quoteId: quote.body.id }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("<table");
    expect(preview.body.html).not.toContain("Generator A");
    expect(preview.body.html).not.toContain("<img src=x onerror");
    expect(preview.body.html).toContain("&lt;img src=x onerror=");
    expect(preview.body.html).toContain("$20.00");
  });

  it("every path in DOCUMENT_VARIABLE_PATHS resolves to real content on a fully-populated document", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({
        name: "Acme Rentals",
        timezone: "America/New_York",
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
        email: "office@acme-rentals.example",
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/bank-accounts`)
      .set("Cookie", accessCookie)
      .send({
        label: "Main account",
        bankName: "Deutsche Bank",
        accountHolder: "Acme Rentals GmbH",
        accountNumber: "1234567890",
        iban: "DE89370400440532013000",
        swiftBic: "DEUTDEFF",
        currency: "EUR",
        bankAddress: "Taunusanlage 12, Frankfurt",
        paymentReference: "Invoice payment",
      })
      .expect(201);

    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({
        firstName: "Vat",
        lastName: "Customer",
        company: "Vat Co",
        address: "1 Customer Street",
        phone: "+1 555 0100",
        email: "vat@example.com",
        vatNumber: "DE999999999",
      })
      .expect(201);

    const categoryId = await createAssetCategory();
    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({
        name: "Generator A",
        internalNumber: "GEN-VAR",
        categoryId,
        serialNumber: "SN-001",
        currentLocationText: "Warehouse 1",
      })
      .expect(201);
    const assetId = assetResponse.body.id as string;

    // A directly-created Rental (DRAFT — items/depositMinor stay fully
    // editable) plus a separately accepted Quote (never converted) covers
    // both rental.* and quote.* variables without fighting RentalsService's
    // "items/dates only editable while DRAFT or QUOTE" rule that a
    // converted (RESERVED) rental would trigger.
    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customer.body.id,
        plannedStart: "2027-01-10T09:30:00.000Z",
        plannedEnd: "2027-01-12T17:00:00.000Z",
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 5000, depositMinor: 10000 }],
      })
      .expect(201);
    const rentalId = rental.body.id as string;

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({
        receivedAt: "2027-01-10T09:00:00.000Z",
        receivedAmountMinor: 10000,
        receivedMethod: "BANK_TRANSFER",
        receivedReference: "TRX-VAR-001",
        notes: "Deposit received in cash-equivalent bank transfer at handover.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({
        returnedAt: "2027-01-12T18:00:00.000Z",
        returnedAmountMinor: 8000,
        retainedAmountMinor: 2000,
        retentionReason: "Minor cosmetic damage",
      })
      .expect(201);

    const quote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customer.body.id,
        validUntil: "2027-02-01T00:00:00.000Z",
        plannedStart: "2027-01-10T09:30:00.000Z",
        plannedEnd: "2027-01-12T17:00:00.000Z",
        termsAndConditions: "Standard rental terms apply.",
        items: [
          {
            itemType: "ASSET",
            assetId,
            name: "Generator A",
            billingMode: "DAILY",
            dailyPriceMinor: 5000,
          },
          {
            itemType: "SERVICE",
            name: "Setup service",
            billingMode: "FLAT",
            unitPriceMinor: 2000,
            quantity: 1,
          },
        ],
      })
      .expect(201);
    const quoteId = quote.body.id as string;
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const templateHtml =
      '<div class="doc-page">' +
      DOCUMENT_VARIABLE_PATHS.map((varPath) => `<div>${varPath}::{{${varPath}}}::end</div>`).join(
        "",
      ) +
      "</div>";
    await createTemplate({ htmlContent: templateHtml }).expect(201);
    const templates = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/document-templates`)
      .set("Cookie", accessCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/document-templates/${templates.body.items[0].id}/activate`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const document = await createDocument({
      customerId: customer.body.id,
      rentalId,
      quoteId,
      assetId,
      title: "Full-coverage title",
      businessData: { notes: "A note that must appear" },
    }).expect(201);
    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${document.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    // company.logo is permanently empty by design (no tenant branding field
    // exists yet, see the hardcoded "" value in variable-resolver.service.ts)
    // — every other path, including company.email (set above), must resolve
    // to real, non-empty content given this fully-populated document. The
    // signature.* fields (Havelio Signature System) stay empty here too —
    // this document never had a signature captured for it; real end-to-end
    // signature-field coverage lives in signatures.e2e-spec.ts instead.
    const permanentlyEmpty = new Set([
      "company.logo",
      "company.logoHtml",
      "signature.companySignatureImageHtml",
      "signature.companySignerName",
      "signature.companySignerTitle",
      "signature.companySignedAt",
      "signature.companySignedAtLabel",
      "signature.customerSignatureImageHtml",
      "signature.customerSignerName",
      "signature.customerSignedAt",
      "signature.customerSignedAtLabel",
    ]);
    for (const varPath of DOCUMENT_VARIABLE_PATHS) {
      const match = new RegExp(`${varPath.replace(/\./g, "\\.")}::(.*?)::end`, "s").exec(
        preview.body.html,
      );
      expect(match, `path "${varPath}" did not appear in rendered output`).not.toBeNull();
      if (permanentlyEmpty.has(varPath)) continue;
      expect(match![1]!.trim(), `path "${varPath}" resolved to empty content`).not.toBe("");
    }
  });
});
