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

const PNG_LOGO_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const PNG_LOGO_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const NOT_AN_IMAGE = Buffer.from("this is definitely not an image file", "utf-8");

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
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — the tenant's own logo
 * shown on its generated customer-facing documents. Security coverage for
 * upload/replace/remove (Tenant.logoStorageKey and friends), cross-tenant
 * isolation, RBAC, and historical PDF/snapshot immutability across the
 * three independent rendering systems (Document, Invoice, Quote).
 */
describe("Company Branding E2E (Havelio Company Logo System)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerCookie: string;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let assetId: string;

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

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", ownerCookie)
      .send({ name: "Generators" })
      .expect(201);
    categoryId = categoryResponse.body.id;

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", ownerCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    assetId = assetResponse.body.id;
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

  function uploadLogo(cookie: string, bytes: Buffer = PNG_LOGO_A, targetTenantId = tenantId) {
    return request(app.getHttpServer())
      .post(`/tenants/${targetTenantId}/company-logo`)
      .set("Cookie", cookie)
      .attach("file", bytes, { filename: "logo.png", contentType: "image/png" });
  }

  async function createRental(): Promise<string> {
    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", ownerCookie)
      .send({
        customerId,
        currency: "USD",
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    return rentalResponse.body.id;
  }

  // -----------------------------------------------------------------
  // CRUD + no-logo fallback
  // -----------------------------------------------------------------

  describe("Upload / replace / remove", () => {
    it("OWNER can upload, preview, and remove the company logo", async () => {
      const uploaded = await uploadLogo(ownerCookie).expect(201);
      expect(uploaded.body.tenant.logoMimeType).toBe("image/png");
      expect(uploaded.body.tenant.logoWidth).toBeGreaterThan(0);

      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(file.headers["content-type"]).toContain("image/png");
      expect(Buffer.compare(file.body as Buffer, PNG_LOGO_A)).toBe(0);

      await request(app.getHttpServer())
        .delete(`/tenants/${tenantId}/company-logo`)
        .set("Cookie", ownerCookie)
        .expect(204);

      // No-logo fallback: a clean 404, never a broken image / crash.
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(404);
    });

    it("replacing the logo swaps the stored file and metadata", async () => {
      await uploadLogo(ownerCookie, PNG_LOGO_A).expect(201);
      const replaced = await uploadLogo(ownerCookie, PNG_LOGO_B).expect(201);
      expect(replaced.body.tenant.logoMimeType).toBe("image/png");

      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, PNG_LOGO_B)).toBe(0);
    });

    it("rejects a malformed / non-image file even with an image content-type", async () => {
      await uploadLogo(ownerCookie, NOT_AN_IMAGE).expect(400);
    });

    it("F/K: never leaks a raw storage path/URL in the upload response", async () => {
      const uploaded = await uploadLogo(ownerCookie).expect(201);
      expect(JSON.stringify(uploaded.body)).not.toContain("tenants/");
      expect(uploaded.body.tenant.logoStorageKey).toBeUndefined();

      // Same guarantee on the general tenant-read endpoint.
      const tenantResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(JSON.stringify(tenantResponse.body)).not.toContain("tenants/");
      expect(tenantResponse.body.tenant.logoStorageKey).toBeUndefined();
    });

    it("E: the server generates the storage key — a client cannot forge or influence it", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.logoStorageKey).toMatch(
        new RegExp(`^tenants/${tenantId}/branding/logo/[0-9a-f-]{36}-logo\\.png$`),
      );
    });
  });

  // -----------------------------------------------------------------
  // RBAC
  // -----------------------------------------------------------------

  describe("RBAC", () => {
    it("C: VIEWER cannot upload, replace, or delete the company logo", async () => {
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");
      await uploadLogo(viewerCookie).expect(403);

      await uploadLogo(ownerCookie).expect(201);
      await request(app.getHttpServer())
        .delete(`/tenants/${tenantId}/company-logo`)
        .set("Cookie", viewerCookie)
        .expect(403);
    });

    it("viewing the logo is allowed for any active staff member (VIEWER included)", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer2@example.com");
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", viewerCookie)
        .expect(200);
    });

    it("D: OWNER/ADMIN-tier can upload and replace", async () => {
      const adminCookie = await createMemberWithRole("ADMIN", "admin@example.com");
      await uploadLogo(adminCookie, PNG_LOGO_A).expect(201);
      await uploadLogo(adminCookie, PNG_LOGO_B).expect(201);
    });
  });

  // -----------------------------------------------------------------
  // Cross-tenant isolation
  // -----------------------------------------------------------------

  describe("Cross-tenant isolation", () => {
    it("A: Tenant A cannot retrieve Tenant B's logo", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const other = await registerSecondTenant();

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", other.cookie)
        .expect(403);
    });

    it("B: Tenant A cannot replace or delete Tenant B's logo", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const other = await registerSecondTenant();

      await uploadLogo(other.cookie, PNG_LOGO_B, tenantId).expect(403);
      await request(app.getHttpServer())
        .delete(`/tenants/${tenantId}/company-logo`)
        .set("Cookie", other.cookie)
        .expect(403);

      // Tenant A's original logo is untouched.
      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, PNG_LOGO_A)).toBe(0);
    });
  });

  // -----------------------------------------------------------------
  // G: deleting the logo does not cascade to unrelated data
  // -----------------------------------------------------------------

  it("G: deleting the company logo does not delete unrelated files (e.g. the stored company signature)", async () => {
    await uploadLogo(ownerCookie).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/company-signature`)
      .set("Cookie", ownerCookie)
      .field("representativeName", "Taras Kutsenko")
      .field("representativeTitle", "President")
      .field("method", "UPLOADED")
      .attach("file", PNG_LOGO_A, { filename: "sig.png", contentType: "image/png" })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/company-logo`)
      .set("Cookie", ownerCookie)
      .expect(204);

    // The unrelated stored signature is still intact and readable.
    const sig = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/company-signature/file`)
      .set("Cookie", ownerCookie)
      .expect(200);
    expect(sig.headers["content-type"]).toContain("image/png");
  });

  // -----------------------------------------------------------------
  // Logo appears on generated documents
  // -----------------------------------------------------------------

  describe("Logo appears on generated documents", () => {
    it("embeds the logo as an inline data URI in a Document's rendered HTML", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const rentalId = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
        .expect(201);

      const preview = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(preview.body.html).toContain("data:image/png;base64,");
    });

    it("a tenant with no logo renders documents cleanly with no broken image tag", async () => {
      const rentalId = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
        .expect(201);

      const preview = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(preview.body.html).not.toContain("data:image/png;base64,");
      expect(preview.body.html).not.toContain('src=""');
    });

    it("embeds the logo base64 into a freshly created Invoice's frozen sellerSnapshot", async () => {
      await uploadLogo(ownerCookie).expect(201);
      const bankResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/bank-accounts`)
        .set("Cookie", ownerCookie)
        .send({ label: "USD account", currency: "USD", iban: "US00000000000000000000" })
        .expect(201);
      const rentalId = await createRental();
      const invoice = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", ownerCookie)
        .send({ rentalId, bankAccountId: bankResponse.body.id })
        .expect(201);
      expect(invoice.body.sellerSnapshot.logoMimeType).toBe("image/png");
      expect(Buffer.from(invoice.body.sellerSnapshot.logoBase64, "base64").equals(PNG_LOGO_A)).toBe(
        true,
      );
    });
  });

  // -----------------------------------------------------------------
  // H: historical finalized documents keep their old logo forever
  // -----------------------------------------------------------------

  describe("H: historical documents are immune to a later logo replacement", () => {
    it("Document: a SIGNED document's persisted PDF is unaffected by a later logo replacement, and regeneration is blocked", async () => {
      await uploadLogo(ownerCookie, PNG_LOGO_A).expect(201);
      const rentalId = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
        .expect(201);
      const documentId = created.body.id as string;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/ready`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/send`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);

      // Two-sided signing finalizes the document (SIGNED), which itself
      // regenerates the PDF internally (embedding logo A, still current).
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "TENANT_REPRESENTATIVE")
        .field("method", "DRAWN")
        .field("signerName", "Taras Kutsenko")
        .attach("file", PNG_LOGO_A, { filename: "sig.png", contentType: "image/png" })
        .expect(201);
      const finalized = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "CUSTOMER")
        .field("method", "DRAWN")
        .field("signerName", "Jane Doe")
        .attach("file", PNG_LOGO_A, { filename: "sig.png", contentType: "image/png" })
        .expect(201);
      expect(finalized.body.document.status).toBe("SIGNED");

      const versionBefore = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId },
        include: { files: { where: { format: "PDF" }, orderBy: { createdAt: "desc" } } },
      });
      const shaBefore = versionBefore.files[0]!.sha256;

      // Replace the tenant's logo — must never retroactively change the
      // already-finalized document.
      await uploadLogo(ownerCookie, PNG_LOGO_B).expect(201);

      // Explicit regeneration is blocked on a SIGNED (terminal) document.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/pdf`)
        .set("Cookie", ownerCookie)
        .expect(409);

      const versionAfter = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId },
        include: { files: { where: { format: "PDF" }, orderBy: { createdAt: "desc" } } },
      });
      expect(versionAfter.files[0]!.sha256).toBe(shaBefore);
    });

    it("Invoice: an ISSUED invoice's frozen sellerSnapshot logo is unaffected by a later logo replacement", async () => {
      await uploadLogo(ownerCookie, PNG_LOGO_A).expect(201);
      const bankResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/bank-accounts`)
        .set("Cookie", ownerCookie)
        .send({ label: "USD account", currency: "USD", iban: "US00000000000000000000" })
        .expect(201);
      const rentalId = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", ownerCookie)
        .send({ rentalId, bankAccountId: bankResponse.body.id })
        .expect(201);
      const issued = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);
      const originalLogoBase64 = issued.body.sellerSnapshot.logoBase64 as string;
      expect(Buffer.from(originalLogoBase64, "base64").equals(PNG_LOGO_A)).toBe(true);

      await uploadLogo(ownerCookie, PNG_LOGO_B).expect(201);

      const refetched = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(refetched.body.sellerSnapshot.logoBase64).toBe(originalLogoBase64);
      expect(
        Buffer.from(refetched.body.sellerSnapshot.logoBase64, "base64").equals(PNG_LOGO_B),
      ).toBe(false);
    });

    it("Quote: regeneration is blocked once ACCEPTED, so an already-sent quote PDF keeps its original logo", async () => {
      await uploadLogo(ownerCookie, PNG_LOGO_A).expect(201);
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes`)
        .set("Cookie", ownerCookie)
        .send({
          customerId,
          validUntil: dateOffset(30),
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(4),
          items: [
            {
              itemType: "ASSET",
              assetId,
              name: "Generator A",
              billingMode: "DAILY",
              dailyPriceMinor: 1000,
            },
          ],
        })
        .expect(201);
      const quoteId = created.body.id as string;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/send`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
        .set("Cookie", ownerCookie)
        .send({})
        .expect(201);

      await uploadLogo(ownerCookie, PNG_LOGO_B).expect(201);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/pdf`)
        .set("Cookie", ownerCookie)
        .expect(409);
    });
  });

  // -----------------------------------------------------------------
  // Customer Portal branding
  // -----------------------------------------------------------------

  describe("Customer Portal branding", () => {
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

    it("reports hasLogo:false with no logo, and hasLogo:true plus a readable file once uploaded", async () => {
      const meBefore = await request(app.getHttpServer())
        .get("/portal/auth/me")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(meBefore.body.tenant.hasLogo).toBe(false);

      await uploadLogo(ownerCookie).expect(201);

      const meAfter = await request(app.getHttpServer())
        .get("/portal/auth/me")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(meAfter.body.tenant.hasLogo).toBe(true);

      const file = await request(app.getHttpServer())
        .get("/portal/branding/logo/file")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, PNG_LOGO_A)).toBe(0);
      expect(JSON.stringify(file.headers)).not.toContain("tenants/");
    });

    it("I: an unauthenticated request cannot read the portal branding logo", async () => {
      await uploadLogo(ownerCookie).expect(201);
      await request(app.getHttpServer()).get("/portal/branding/logo/file").expect(401);
    });

    it("J: a portal session only ever sees its own tenant's logo, never another tenant's", async () => {
      const other = await registerSecondTenant();
      await uploadLogo(other.cookie, PNG_LOGO_B, other.tenantId).expect(201);
      // This tenant has no logo of its own.
      await request(app.getHttpServer())
        .get("/portal/branding/logo/file")
        .set("Cookie", portalAccessCookie)
        .expect(404);
    });
  });
});
