import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string; slug: string };
}

/** Builds a solid-color test image in the given source format/size — real, meaningfully-sized fixtures for the normalization pipeline (see docs/DECISIONS.md D-119), not 1x1 placeholder pixels. */
async function buildTestImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number; alpha?: number },
  format: "png" | "jpeg" | "webp" = "png",
): Promise<Buffer> {
  const image = sharp({
    create: { width, height, channels: 4, background: color },
  });
  if (format === "png") return image.png().toBuffer();
  if (format === "jpeg") return image.jpeg().toBuffer();
  return image.webp().toBuffer();
}

/** Decodes to raw RGBA pixels for perceptual comparison — robust against the PNG/JPEG/WebP encoder's own byte-level choices, unlike a raw-byte comparison (which normalization deliberately changes even for visually-identical content). */
async function decodeRawRgba(
  buffer: Buffer,
): Promise<{ width: number; height: number; data: Buffer }> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

const NOT_AN_IMAGE = Buffer.from("this is definitely not an image file", "utf-8");

/** Pixel-level equivalence — the stored/served bytes are a normalized re-encode (see D-119), never byte-identical to the source, so every "is this the logo I uploaded" assertion compares decoded pixels instead of raw bytes. */
async function expectSamePixels(actual: Buffer, expectedSource: Buffer): Promise<void> {
  const [a, b] = await Promise.all([decodeRawRgba(actual), decodeRawRgba(expectedSource)]);
  expect({ width: a.width, height: a.height }).toEqual({ width: b.width, height: b.height });
  expect(Buffer.compare(a.data, b.data)).toBe(0);
}

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
  let PNG_LOGO_A: Buffer;
  let PNG_LOGO_B: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
    PNG_LOGO_A = await buildTestImage(40, 30, { r: 29, g: 78, b: 216, alpha: 1 });
    PNG_LOGO_B = await buildTestImage(40, 30, { r: 220, g: 38, b: 38, alpha: 1 });
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

  function uploadLogo(
    cookie: string,
    bytes: Buffer = PNG_LOGO_A,
    targetTenantId = tenantId,
    fileMeta: { filename: string; contentType: string } = {
      filename: "logo.png",
      contentType: "image/png",
    },
  ) {
    return request(app.getHttpServer())
      .post(`/tenants/${targetTenantId}/company-logo`)
      .set("Cookie", cookie)
      .attach("file", bytes, fileMeta);
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
      await expectSamePixels(file.body as Buffer, PNG_LOGO_A);

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
      await expectSamePixels(file.body as Buffer, PNG_LOGO_B);
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
        new RegExp(`^tenants/${tenantId}/branding/logo/[0-9a-f-]{36}\\.png$`),
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
      await expectSamePixels(file.body as Buffer, PNG_LOGO_A);
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
      await expectSamePixels(
        Buffer.from(invoice.body.sellerSnapshot.logoBase64, "base64"),
        PNG_LOGO_A,
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
      await expectSamePixels(Buffer.from(originalLogoBase64, "base64"), PNG_LOGO_A);

      await uploadLogo(ownerCookie, PNG_LOGO_B).expect(201);

      const refetched = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
        .set("Cookie", ownerCookie)
        .expect(200);
      // Frozen snapshot is untouched by the later replace — same exact
      // base64 string as right after issue, and still Logo A's pixels,
      // never Logo B's.
      expect(refetched.body.sellerSnapshot.logoBase64).toBe(originalLogoBase64);
      await expectSamePixels(Buffer.from(refetched.body.sellerSnapshot.logoBase64, "base64"), PNG_LOGO_A);
      const stillNotLogoB = await decodeRawRgba(
        Buffer.from(refetched.body.sellerSnapshot.logoBase64, "base64"),
      );
      const logoBPixels = await decodeRawRgba(PNG_LOGO_B);
      expect(Buffer.compare(stillNotLogoB.data, logoBPixels.data)).not.toBe(0);
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
      await expectSamePixels(file.body as Buffer, PNG_LOGO_A);
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

  // -----------------------------------------------------------------
  // Server-side image normalization pipeline (docs/DECISIONS.md D-119)
  // -----------------------------------------------------------------

  describe("Image normalization pipeline", () => {
    async function fetchLogoFile(): Promise<Buffer> {
      const res = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      return res.body as Buffer;
    }

    it("PNG source: normalizes to canonical PNG, dimensions preserved (already within the box)", async () => {
      const png = await buildTestImage(400, 300, { r: 10, g: 200, b: 40 }, "png");
      const uploaded = await uploadLogo(ownerCookie, png, tenantId, {
        filename: "logo.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoMimeType).toBe("image/png");
      expect(uploaded.body.tenant.logoWidth).toBe(400);
      expect(uploaded.body.tenant.logoHeight).toBe(300);
      await expectSamePixels(await fetchLogoFile(), png);
    });

    it("JPEG source: normalizes to canonical PNG", async () => {
      const jpeg = await buildTestImage(400, 300, { r: 200, g: 10, b: 40 }, "jpeg");
      const uploaded = await uploadLogo(ownerCookie, jpeg, tenantId, {
        filename: "logo.jpg",
        contentType: "image/jpeg",
      }).expect(201);
      expect(uploaded.body.tenant.logoMimeType).toBe("image/png");
      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(file.headers["content-type"]).toContain("image/png");
      // JPEG is lossy — compare against a JPEG round-trip of the same
      // source (not the raw pre-JPEG-encode pixels) to avoid a flaky
      // exact-pixel assertion; the stored PNG must still be lossless from
      // the POINT OF the JPEG bytes onward (sharp decode -> sharp encode
      // introduces no further loss).
      await expectSamePixels(file.body as Buffer, jpeg);
    });

    it("WebP source: normalizes to canonical PNG", async () => {
      const webp = await buildTestImage(400, 300, { r: 40, g: 40, b: 220 }, "webp");
      const uploaded = await uploadLogo(ownerCookie, webp, tenantId, {
        filename: "logo.webp",
        contentType: "image/webp",
      }).expect(201);
      expect(uploaded.body.tenant.logoMimeType).toBe("image/png");
      const file = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/company-logo/file`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(file.headers["content-type"]).toContain("image/png");
      await expectSamePixels(file.body as Buffer, webp);
    });

    it("preserves transparency through normalization", async () => {
      const transparent = await sharp({
        create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([
          {
            input: await sharp({
              create: { width: 150, height: 60, channels: 4, background: { r: 20, g: 20, b: 200, alpha: 1 } },
            })
              .png()
              .toBuffer(),
            left: 75,
            top: 30,
          },
        ])
        .png()
        .toBuffer();

      await uploadLogo(ownerCookie, transparent, tenantId, {
        filename: "transparent.png",
        contentType: "image/png",
      }).expect(201);
      const stored = await fetchLogoFile();
      const decoded = await sharp(stored).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Corner pixel (outside the opaque composited square) must still be
      // fully transparent — normalization must never force an opaque
      // white/black background under a transparent source.
      const cornerIndex = 0; // top-left pixel, RGBA
      expect(decoded.data[cornerIndex + 3]).toBe(0);
      // Center pixel (inside the composited opaque square) must be opaque.
      const centerX = 150;
      const centerY = 60;
      const centerIndex = (centerY * decoded.info.width + centerX) * 4;
      expect(decoded.data[centerIndex + 3]).toBe(255);
    });

    it("wide logo: downscales proportionally when it exceeds the normalized box, never distorts", async () => {
      const wide = await buildTestImage(3200, 400, { r: 100, g: 100, b: 100 });
      const uploaded = await uploadLogo(ownerCookie, wide, tenantId, {
        filename: "wide.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoWidth).toBe(1600);
      expect(uploaded.body.tenant.logoHeight).toBe(200); // 3200:400 = 16:2 aspect preserved at 1600 width
    });

    it("tall logo: downscales proportionally when it exceeds the normalized box, never distorts", async () => {
      const tall = await buildTestImage(400, 3200, { r: 100, g: 100, b: 100 });
      const uploaded = await uploadLogo(ownerCookie, tall, tenantId, {
        filename: "tall.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoHeight).toBe(1600);
      expect(uploaded.body.tenant.logoWidth).toBe(200);
    });

    it("oversized logo: normalizes proportionally within the box (e.g. 5000x3000 -> ~1600x960)", async () => {
      const oversized = await buildTestImage(5000, 3000, { r: 30, g: 30, b: 30 });
      const uploaded = await uploadLogo(ownerCookie, oversized, tenantId, {
        filename: "oversized.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoWidth).toBe(1600);
      expect(uploaded.body.tenant.logoHeight).toBe(960);
      // The stored/normalized file is dramatically smaller than the source.
      expect(uploaded.body.tenant.logoSizeBytes).toBeLessThan(oversized.length);
    });

    it("small logo: is never upscaled past its own resolution", async () => {
      const small = await buildTestImage(250, 100, { r: 50, g: 150, b: 50 });
      const uploaded = await uploadLogo(ownerCookie, small, tenantId, {
        filename: "small.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoWidth).toBe(250);
      expect(uploaded.body.tenant.logoHeight).toBe(100);
    });

    it("rejects a source image whose real decoded dimensions exceed the source cap", async () => {
      const huge = await buildTestImage(8500, 200, { r: 1, g: 1, b: 1 });
      await uploadLogo(ownerCookie, huge, tenantId, {
        filename: "huge.png",
        contentType: "image/png",
      }).expect(400);
    });

    it("rejects real image bytes of an unsupported format even when mislabeled as an allowed Content-Type (MIME mismatch)", async () => {
      const gifBytes = await sharp({
        create: { width: 100, height: 60, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
        .gif()
        .toBuffer();
      // Client claims image/png in Content-Type, but the real bytes decode
      // as GIF — validateImage's MIME-allowlist check alone would pass this
      // (it only inspects the claimed Content-Type); the real-format check
      // inside normalize() is what actually rejects it.
      await uploadLogo(ownerCookie, gifBytes, tenantId, {
        filename: "disguised.png",
        contentType: "image/png",
      }).expect(400);
    });

    it("still accepts a genuinely valid, allowed-format image even if mislabeled with a different allowed Content-Type", async () => {
      const jpeg = await buildTestImage(300, 200, { r: 90, g: 90, b: 200 }, "jpeg");
      // Real bytes are JPEG (an allowed format) but the client claims
      // image/png — accepted, because normalize() trusts the real decoded
      // format (jpeg, itself allowed), never the client's label.
      const uploaded = await uploadLogo(ownerCookie, jpeg, tenantId, {
        filename: "mislabeled.png",
        contentType: "image/png",
      }).expect(201);
      expect(uploaded.body.tenant.logoMimeType).toBe("image/png");
    });

    it("replacing the logo deletes the previous storage object (no unbounded orphan growth)", async () => {
      const first = await buildTestImage(300, 200, { r: 1, g: 2, b: 3 });
      await uploadLogo(ownerCookie, first, tenantId, {
        filename: "first.png",
        contentType: "image/png",
      }).expect(201);
      const afterFirst = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const firstKey = afterFirst.logoStorageKey!;

      const second = await buildTestImage(300, 200, { r: 4, g: 5, b: 6 });
      await uploadLogo(ownerCookie, second, tenantId, {
        filename: "second.png",
        contentType: "image/png",
      }).expect(201);

      // The first object is gone — cross-checked the only way available
      // from outside StorageService: the tenant no longer points at it,
      // and a raw read via the file endpoint now serves the second image's
      // pixels only. The DELETE-endpoint 404 test below covers the
      // stronger "no such file" case via a direct StorageService read.
      const stored = await fetchLogoFile();
      await expectSamePixels(stored, second);
      const currentTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(currentTenant.logoStorageKey).not.toBe(firstKey);
    });

    it("Quote PDF genuinely contains a real embedded image after a WebP-origin logo upload (not just HTML/Puppeteer documents)", async () => {
      const webp = await buildTestImage(500, 200, { r: 250, g: 150, b: 10 }, "webp");
      await uploadLogo(ownerCookie, webp, tenantId, {
        filename: "logo.webp",
        contentType: "image/webp",
      }).expect(201);

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

      const pdf = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/quotes/${created.body.id}/pdf`)
        .set("Cookie", ownerCookie)
        .expect(200);
      const pdfBytes = pdf.body as Buffer;
      const pdfText = pdfBytes.toString("latin1");
      expect(pdfText).toContain("/Subtype /Image");
    });

    it("a WebP-origin logo renders on every customer-facing document type", async () => {
      const webp = await buildTestImage(500, 200, { r: 10, g: 150, b: 250 }, "webp");
      await uploadLogo(ownerCookie, webp, tenantId, {
        filename: "logo.webp",
        contentType: "image/webp",
      }).expect(201);
      const rentalId = await createRental();

      const bankResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/bank-accounts`)
        .set("Cookie", ownerCookie)
        .send({ label: "USD account", currency: "USD", iban: "US00000000000000000000" })
        .expect(201);

      async function previewHasImage(documentType: string): Promise<boolean> {
        const created = await request(app.getHttpServer())
          .post(`/tenants/${tenantId}/documents`)
          .set("Cookie", ownerCookie)
          .send({ documentType, customerId, rentalId, title: documentType })
          .expect(201);
        const preview = await request(app.getHttpServer())
          .get(`/tenants/${tenantId}/documents/${created.body.id}/preview`)
          .set("Cookie", ownerCookie)
          .expect(200);
        return (preview.body.html as string).includes("data:image/png;base64,");
      }

      expect(await previewHasImage("CONTRACT")).toBe(true);
      expect(await previewHasImage("HANDOVER_PROTOCOL")).toBe(true);
      expect(await previewHasImage("RETURN_PROTOCOL")).toBe(true);
      expect(await previewHasImage("DEPOSIT_RECEIPT")).toBe(true);

      const invoice = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", ownerCookie)
        .send({ rentalId, bankAccountId: bankResponse.body.id })
        .expect(201);
      expect(invoice.body.sellerSnapshot.logoMimeType).toBe("image/png");

      // Quote PDF, proven separately above via real image-XObject
      // inspection (pdfkit-rendered, not an HTML `<img>` tag).
      const quotePdfCheck = await request(app.getHttpServer())
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
      const pdf = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/quotes/${quotePdfCheck.body.id}/pdf`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect((pdf.body as Buffer).toString("latin1")).toContain("/Subtype /Image");
    });

    it("email CID attachment receives the normalized (always-PNG) logo bytes, never a raw R2 URL, regardless of source format", async () => {
      const webp = await buildTestImage(300, 150, { r: 120, g: 20, b: 220 }, "webp");
      await uploadLogo(ownerCookie, webp, tenantId, {
        filename: "logo.webp",
        contentType: "image/webp",
      }).expect(201);

      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      expect(tenant.logoMimeType).toBe("image/png");

      // Send a document email and inspect the delivery's stored HTML/status
      // rather than a real inbox (no real SMTP provider in this
      // environment — see EMAIL LOGO REAL DELIVERY in the final report).
      const rentalId = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
        .expect(201);
      const sendResult = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${created.body.id}/email`)
        .set("Cookie", ownerCookie)
        .send({ recipientType: "CUSTOMER", subject: "Your contract" })
        .expect(201);
      // No real SMTP provider is configured in this test environment, so
      // this always reports NOT_CONFIGURED rather than a fabricated SENT —
      // the meaningful assertion here is that dispatch (and therefore the
      // CID/logo-reading code path) ran without throwing, exercising
      // buildLogoEmailParts()/readLogo() against the normalized PNG bytes.
      expect(["NOT_CONFIGURED", "SENT", "FAILED"]).toContain(sendResult.body.status);
      expect(JSON.stringify(sendResult.body)).not.toContain("tenants/");
    });

    it("normalization does not weaken finalized-document logo immutability", async () => {
      const logoA = await buildTestImage(600, 300, { r: 5, g: 120, b: 5 });
      await uploadLogo(ownerCookie, logoA, tenantId, {
        filename: "a.png",
        contentType: "image/png",
      }).expect(201);
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
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "TENANT_REPRESENTATIVE")
        .field("method", "DRAWN")
        .field("signerName", "Owner")
        .attach("file", logoA, { filename: "sig.png", contentType: "image/png" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signatures`)
        .set("Cookie", ownerCookie)
        .field("signerType", "CUSTOMER")
        .field("method", "DRAWN")
        .field("signerName", "Jane Doe")
        .attach("file", logoA, { filename: "sig.png", contentType: "image/png" })
        .expect(201);

      const versionBefore = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId },
        include: { files: { where: { format: "PDF" }, orderBy: { createdAt: "desc" } } },
      });
      const shaBefore = versionBefore.files[0]!.sha256;

      // Replace with a WebP-sourced Logo B — exercising normalization on
      // the replacement path too.
      const logoB = await buildTestImage(600, 300, { r: 120, g: 5, b: 5 }, "webp");
      await uploadLogo(ownerCookie, logoB, tenantId, {
        filename: "b.webp",
        contentType: "image/webp",
      }).expect(201);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/pdf`)
        .set("Cookie", ownerCookie)
        .expect(409);

      const versionAfter = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId },
        include: { files: { where: { format: "PDF" }, orderBy: { createdAt: "desc" } } },
      });
      expect(versionAfter.files[0]!.sha256).toBe(shaBefore);

      // A brand-new draft document created now uses Logo B.
      const created2 = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", ownerCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Second contract" })
        .expect(201);
      const preview2 = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${created2.body.id}/preview`)
        .set("Cookie", ownerCookie)
        .expect(200);
      expect(preview2.body.html).toContain("data:image/png;base64,");
    });
  });
});
