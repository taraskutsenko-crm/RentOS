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

  it("picks the requested templateLanguage when creating a document, and falls back to the built-in default when ambiguous", async () => {
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

    // No templateLanguage given and two languages are active — ambiguous,
    // falls back to the built-in default rather than guessing.
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
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
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

    // company.logo/company.email are permanently hardcoded to "" in the
    // resolver (no tenant branding/company-email field exists yet) — same
    // documented exception as the real-render coverage test below.
    const permanentlyEmpty = new Set(["company.logo", "company.email"]);
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

  it("sends a document by email to the customer and records the delivery as SENT", async () => {
    const created = await createDocument().expect(201);
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
      .set("Cookie", accessCookie)
      .send({ recipientType: "CUSTOMER", subject: "Your contract" })
      .expect(201);

    expect(response.body.status).toBe("SENT");
    expect(response.body.recipientEmail).toBe("jane@example.com");
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
    expect(actions).toContain("document.email_sent");
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
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
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
        registrationNumber: "HRB 12345",
        taxNumber: "DE123456789",
        address: "Musterstrasse 1, Berlin",
        phone: "+49 30 1234567",
      })
      .expect(200);

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

    const quote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customer.body.id,
        validUntil: "2027-02-01T00:00:00.000Z",
        plannedStart: "2027-01-10T09:30:00.000Z",
        plannedEnd: "2027-01-12T17:00:00.000Z",
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

    // company.logo and company.email are permanently empty by design (no
    // tenant branding/company-email field exists yet, see hardcoded ""
    // values in variable-resolver.service.ts) — every other path must
    // resolve to real, non-empty content given this fully-populated document.
    const permanentlyEmpty = new Set(["company.logo", "company.email"]);
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
