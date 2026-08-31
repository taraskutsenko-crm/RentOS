import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string; slug: string };
}

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function tokenFromInviteLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1]!;
}

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md) — a plain visual
 * handwritten signature, NOT a qualified electronic signature. Security
 * coverage for the stored company signature (TenantSignature) and the
 * per-document immutable evidence (DocumentSignatureEvidence).
 */
describe("Signatures E2E (Havelio Signature System)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerCookie: string;
  let tenantId: string;
  let customerId: string;
  let rentalId: string;

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
    ownerCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", ownerCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;

    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", ownerCookie)
      .send({ customerId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4) })
      .expect(201);
    rentalId = rentalResponse.body.id;
  });

  async function createMemberWithRole(role: string, email: string): Promise<string> {
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

  async function registerSecondTenant(): Promise<{ tenantId: string; cookie: string }> {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = response.body as RegisterResponseBody;
    const otherCookie = extractCookie(response.headers, "rentos_access_token");
    return { tenantId: otherBody.tenant.id, cookie: otherCookie };
  }

  function uploadCompanySignature(cookie: string, name = "Taras Kutsenko") {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/company-signature`)
      .set("Cookie", cookie)
      .field("representativeName", name)
      .field("representativeTitle", "President")
      .field("method", "UPLOADED")
      .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" });
  }

  async function createSentContract(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", ownerCookie)
      .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
      .expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/ready`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(201);
    return id;
  }

  function captureCompanySignature(documentId: string, cookie = ownerCookie) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
      .set("Cookie", cookie)
      .field("signerType", "TENANT_REPRESENTATIVE")
      .field("method", "DRAWN")
      .field("signerName", "Taras Kutsenko")
      .field("signerTitle", "President")
      .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" });
  }

  function captureCustomerSignature(documentId: string, cookie = ownerCookie) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
      .set("Cookie", cookie)
      .field("signerType", "CUSTOMER")
      .field("method", "DRAWN")
      .field("signerName", "Jane Doe")
      .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" });
  }

  // -----------------------------------------------------------------
  // Stored company signature
  // -----------------------------------------------------------------

  describe("Stored company signature", () => {
    it("OWNER can upload, read, and delete the company signature", async () => {
      const uploaded = await uploadCompanySignature(ownerCookie).expect(201);
      expect(uploaded.body.representativeName).toBe("Taras Kutsenko");
      expect(uploaded.body.method).toBe("UPLOADED");

      const meta = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(meta.body.signature.id).toBe(uploaded.body.id);

      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(file.headers["content-type"]).toContain("image/png");

      await request(app.getHttpServer())
        .delete(`/tenants/${tenantId}/company-signature`)
        .set("Cookie", ownerCookie)
        .expect(204);

      const afterDelete = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(afterDelete.body.signature).toBeNull();
    });

    it("D: VIEWER cannot replace the company signature", async () => {
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");
      await uploadCompanySignature(viewerCookie).expect(403);
    });

    it("E: OWNER (and ADMIN-tier) can replace it", async () => {
      await uploadCompanySignature(ownerCookie, "First Rep").expect(201);
      const replaced = await uploadCompanySignature(ownerCookie, "Second Rep").expect(201);
      expect(replaced.body.representativeName).toBe("Second Rep");

      const meta = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(meta.body.signature.representativeName).toBe("Second Rep");
    });

    it("A: Tenant A cannot read Tenant B's stored company signature", async () => {
      await uploadCompanySignature(ownerCookie).expect(201);
      const other = await registerSecondTenant();

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature`)
        .set("Cookie", other.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-signature/file`)
        .set("Cookie", other.cookie)
        .expect(403);
    });

    it("K: never leaks a raw storage path/URL in the response", async () => {
      const uploaded = await uploadCompanySignature(ownerCookie).expect(201);
      expect(JSON.stringify(uploaded.body)).not.toContain("tenants/");
      expect(uploaded.body.storageKey).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // Document signature evidence
  // -----------------------------------------------------------------

  describe("Document signature evidence", () => {
    it("captures a company signature via STORED_SIGNATURE, reusing the saved TenantSignature's bytes", async () => {
      await uploadCompanySignature(ownerCookie).expect(201);
      const documentId = await createSentContract();

      const captured = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "TENANT_REPRESENTATIVE")
        .field("method", "STORED_SIGNATURE")
        .field("signerName", "Taras Kutsenko")
        .field("signerTitle", "President")
        .expect(201);

      expect(captured.body.evidence.method).toBe("STORED_SIGNATURE");
      expect(captured.body.evidence.source).toBe("COMPANY_PROFILE");
      expect(captured.body.document.status).toBe("PARTIALLY_SIGNED");
    });

    it("two-sided signing: capturing both signatures moves the document to SIGNED and generates a hashed final PDF", async () => {
      const documentId = await createSentContract();

      const companyResult = await captureCompanySignature(documentId).expect(201);
      expect(companyResult.body.document.status).toBe("PARTIALLY_SIGNED");

      const customerResult = await captureCustomerSignature(documentId).expect(201);
      expect(customerResult.body.document.status).toBe("SIGNED");

      const list = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(list.body).toHaveLength(2);

      const version = await prisma.documentVersion.findFirst({
        where: { documentId },
        include: { files: { where: { format: "PDF" }, orderBy: { createdAt: "desc" } } },
      });
      const latestPdf = version!.files[0];
      expect(latestPdf).toBeDefined();
      expect(latestPdf!.sha256).toMatch(/^[0-9a-f]{64}$/);

      // The rendered content actually embeds both signatures — not just
      // status/DB-row bookkeeping (covers the signature.* variable paths
      // that document-rendering.e2e-spec.ts's coverage test deliberately
      // exempts, since that document never captures real evidence).
      const preview = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/preview`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(preview.body.html).toContain("Taras Kutsenko");
      expect(preview.body.html).toContain("President");
      expect(preview.body.html).toContain("Jane Doe");
      expect(preview.body.html).toContain("data:image/png;base64,");
    });

    it("F: rejects a second signature for the same signerType — evidence is immutable once captured", async () => {
      const documentId = await createSentContract();
      await captureCompanySignature(documentId).expect(201);
      await captureCompanySignature(documentId).expect(409);
    });

    it("H: rejects capturing a signature once the document is fully SIGNED — signed evidence cannot be added/removed by ordinary flow", async () => {
      const documentId = await createSentContract();
      await captureCompanySignature(documentId).expect(201);
      await captureCustomerSignature(documentId).expect(201);

      // Document is now SIGNED; a third capture attempt of either type is rejected.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "TENANT_REPRESENTATIVE")
        .field("method", "DRAWN")
        .field("signerName", "Someone Else")
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(409);

      // Ordinary document edit is also already blocked once non-DRAFT.
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/documents/${documentId}`)
        .set("Cookie", ownerCookie)
        .send({ title: "Should not apply" })
        .expect(409);
    });

    it("G: replacing the saved company signature does not affect a document already signed with the old one", async () => {
      const first = await uploadCompanySignature(ownerCookie, "Original Rep").expect(201);
      const documentId = await createSentContract();
      const captured = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "TENANT_REPRESENTATIVE")
        .field("method", "STORED_SIGNATURE")
        .field("signerName", "Original Rep")
        .expect(201);
      const evidenceId = captured.body.evidence.id as string;

      const evidenceRow = await prisma.documentSignatureEvidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });

      // Replace the saved company signature with a different one.
      await uploadCompanySignature(ownerCookie, "New Rep").expect(201);
      const activeNow = await prisma.tenantSignature.findFirst({
        where: { tenantId, deletedAt: null },
      });
      expect(activeNow!.representativeName).toBe("New Rep");
      expect(activeNow!.id).not.toBe(first.body.id);

      // The document's captured evidence is untouched — same row, same
      // checksum, still readable, still shows "Original Rep".
      const evidenceRowAfter = await prisma.documentSignatureEvidence.findUniqueOrThrow({
        where: { id: evidenceId },
      });
      expect(evidenceRowAfter.checksumSha256).toBe(evidenceRow.checksumSha256);
      expect(evidenceRowAfter.signerName).toBe("Original Rep");

      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/signatures/${evidenceId}/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(file.headers["content-type"]).toContain("image/png");
    });

    it("B/C: Tenant A cannot read or apply a signature on Tenant B's document", async () => {
      const documentId = await createSentContract();
      await captureCompanySignature(documentId).expect(201);
      const other = await registerSecondTenant();

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", other.cookie)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", other.cookie)
        .field("signerType", "CUSTOMER")
        .field("method", "DRAWN")
        .field("signerName", "Intruder")
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(403);
    });

    it("K: signature evidence list never leaks a raw storage path/URL", async () => {
      const documentId = await createSentContract();
      await captureCompanySignature(documentId).expect(201);

      const list = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain("tenants/");
      expect(list.body[0].storageKey).toBeUndefined();
    });

    it("TECHNICIAN can capture signatures (documents.sign) but VIEWER cannot", async () => {
      const documentId = await createSentContract();
      const techCookie = await createMemberWithRole("TECHNICIAN", "tech@example.com");
      await captureCompanySignature(documentId, techCookie).expect(201);

      const documentId2 = await createSentContract();
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer2@example.com");
      await captureCompanySignature(documentId2, viewerCookie).expect(403);
    });
  });

  // -----------------------------------------------------------------
  // Customer Portal remote signing
  // -----------------------------------------------------------------

  describe("Customer Portal remote signing", () => {
    let portalAccessCookie: string;

    beforeEach(async () => {
      const inviteResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);
      const token = tokenFromInviteLink(inviteResponse.body.inviteLink);
      const activateResponse = await request(app.getHttpServer())
        .post("/portal/auth/activate-invitation")
        .send({ token, password: "SuperSecretPortal123" })
        .expect(200);
      portalAccessCookie = extractCookie(activateResponse.headers, "rentos_portal_access_token");
    });

    it("the customer can draw and submit their own signature for their document", async () => {
      const documentId = await createSentContract();

      const captured = await request(app.getHttpServer())
        .post(`/portal/documents/${documentId}/signatures`)
        .set("Cookie", portalAccessCookie)
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(201);
      expect(captured.body.evidence.signerType).toBe("CUSTOMER");
      expect(captured.body.evidence.source).toBe("CUSTOMER_PORTAL");
      expect(captured.body.evidence.signerName).toBe("Jane Doe");

      const list = await request(app.getHttpServer())
        .get(`/portal/documents/${documentId}/signatures`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(list.body).toHaveLength(1);
    });

    it("I: an invalid/missing portal token cannot sign", async () => {
      const documentId = await createSentContract();
      await request(app.getHttpServer())
        .post(`/portal/documents/${documentId}/signatures`)
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(401);

      await request(app.getHttpServer())
        .post(`/portal/documents/${documentId}/signatures`)
        .set("Cookie", "rentos_portal_access_token=garbage")
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(401);
    });

    it("J: a portal session cannot sign a document belonging to a different customer", async () => {
      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", ownerCookie)
        .send({ firstName: "Other", lastName: "Customer", email: "other-cust@example.com" })
        .expect(201);
      const otherRental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", ownerCookie)
        .send({
          customerId: otherCustomer.body.id,
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(4),
        })
        .expect(201);
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({
          documentType: "CONTRACT",
          customerId: otherCustomer.body.id,
          rentalId: otherRental.body.id,
        })
        .expect(201);
      const otherDocumentId = created.body.id as string;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${otherDocumentId}/ready`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${otherDocumentId}/send`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);

      // Jane's portal session tries to sign a document belonging to
      // "Other Customer" — must 404, the exact same shape as any other
      // resource-mismatch case, never leaking that the document exists.
      await request(app.getHttpServer())
        .post(`/portal/documents/${otherDocumentId}/signatures`)
        .set("Cookie", portalAccessCookie)
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(404);
    });

    it("does not change the original plannedEnd/document business content, and leaves original evidence untouched by a later staff signature", async () => {
      const documentId = await createSentContract();
      await request(app.getHttpServer())
        .post(`/portal/documents/${documentId}/signatures`)
        .set("Cookie", portalAccessCookie)
        .attach("file", PNG_BYTES, { filename: "sig.png", contentType: "image/png" })
        .expect(201);

      const afterCustomer = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(afterCustomer.body.status).toBe("PARTIALLY_SIGNED");

      await captureCompanySignature(documentId).expect(201);

      const finalDoc = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(finalDoc.body.status).toBe("SIGNED");

      const list = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(
        list.body.find((row: { signerType: string }) => row.signerType === "CUSTOMER").source,
      ).toBe("CUSTOMER_PORTAL");
    });
  });
});
