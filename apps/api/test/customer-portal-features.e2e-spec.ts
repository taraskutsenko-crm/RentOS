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

// supertest/superagent only auto-buffers response.body for content-types it
// recognizes as binary; "application/zip" isn't one of them, so requests for
// the ZIP endpoint need an explicit raw-buffer parser. Typed loosely because
// superagent's own `Parser` type is a two-overload union (string-body vs.
// stream-body) that a single concretely-typed function cannot satisfy
// structurally.
interface BinaryParserSource {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
}

function binaryParser(
  res: BinaryParserSource,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Customer Portal Features E2E (TASK-0009)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staffCookie: string;
  let tenantId: string;
  let tenantSlug: string;
  let customerId: string;
  let assetId: string;
  let rentalId: string;
  let portalAccessCookie: string;

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
    tenantSlug = body.tenant.slug;
    staffCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", staffCookie)
      .send({ name: "Generators" })
      .expect(201);

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", staffCookie)
      .send({
        name: "Generator A",
        internalNumber: "GEN-0001",
        categoryId: categoryResponse.body.id,
      })
      .expect(201);
    assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", staffCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;

    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", staffCookie)
      .send({
        customerId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    rentalId = rentalResponse.body.id;

    // Invite + activate the customer's portal account.
    const inviteResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
      .set("Cookie", staffCookie)
      .send({})
      .expect(201);
    const token = tokenFromInviteLink(inviteResponse.body.inviteLink);
    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);
    portalAccessCookie = extractCookie(activateResponse.headers, "rentos_portal_access_token");
  });

  describe("Rentals", () => {
    it("lists and shows the customer's own rentals, stripping internalNotes", async () => {
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .send({ internalNotes: "staff-only note" })
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get("/portal/rentals")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(listResponse.body.items).toHaveLength(1);
      expect(listResponse.body.items[0].internalNotes).toBeUndefined();

      const detailResponse = await request(app.getHttpServer())
        .get(`/portal/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(detailResponse.body.id).toBe(rentalId);
      expect(detailResponse.body.internalNotes).toBeUndefined();
    });

    it("returns the rental timeline", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portal/rentals/${rentalId}/timeline`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("404s for a rental belonging to a different customer", async () => {
      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", staffCookie)
        .send({ firstName: "Other", lastName: "Customer" })
        .expect(201);
      const otherRental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", staffCookie)
        .send({
          customerId: otherCustomer.body.id,
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(4),
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/portal/rentals/${otherRental.body.id}`)
        .set("Cookie", portalAccessCookie)
        .expect(404);
    });

    it("returns a QR code PNG for a rental", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portal/rentals/${rentalId}/qr-code`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(response.headers["content-type"]).toContain("image/png");
      expect(response.body.slice(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // PNG magic bytes
    });
  });

  describe("Documents", () => {
    async function createSentDocument(): Promise<string> {
      const createResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", staffCookie)
        .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
        .expect(201);
      const id = createResponse.body.id;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${id}/ready`)
        .set("Cookie", staffCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${id}/send`)
        .set("Cookie", staffCookie)
        .send({})
        .expect(201);
      return id;
    }

    it("lists and previews the customer's documents, advancing SENT -> VIEWED", async () => {
      const documentId = await createSentDocument();

      const listResponse = await request(app.getHttpServer())
        .get("/portal/documents")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(listResponse.body.items).toHaveLength(1);

      const previewResponse = await request(app.getHttpServer())
        .get(`/portal/documents/${documentId}/preview`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(previewResponse.body.html).toContain("<html");

      const detailResponse = await request(app.getHttpServer())
        .get(`/portal/documents/${documentId}`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(detailResponse.body.status).toBe("VIEWED");
    });

    it("downloads a real PDF and records the download", async () => {
      const documentId = await createSentDocument();

      const response = await request(app.getHttpServer())
        .get(`/portal/documents/${documentId}/pdf`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.body.slice(0, 4).toString()).toBe("%PDF");
    });

    it("completes a signature request end to end, advancing Document.status to SIGNED", async () => {
      const documentId = await createSentDocument();

      const signatureRequestResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents/${documentId}/signature-requests`)
        .set("Cookie", staffCookie)
        .send({ signerName: "Jane Doe" })
        .expect(201);
      const signatureRequestId = signatureRequestResponse.body.id;

      const listResponse = await request(app.getHttpServer())
        .get(`/portal/documents/${documentId}/signature-requests`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(listResponse.body).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/portal/documents/${documentId}/signature-requests/${signatureRequestId}/sign`)
        .set("Cookie", portalAccessCookie)
        .expect(201);

      const documentResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${documentId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(documentResponse.body.status).toBe("SIGNED");
    });

    it("downloads a ZIP of every document for a rental", async () => {
      await createSentDocument();
      await createSentDocument();

      const response = await request(app.getHttpServer())
        .get(`/portal/rentals/${rentalId}/documents/zip`)
        .set("Cookie", portalAccessCookie)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers["content-type"]).toBe("application/zip");
      expect((response.body as Buffer).slice(0, 2).toString("hex")).toBe("504b"); // ZIP magic bytes ("PK")
    });

    it("404s for a document belonging to a different customer", async () => {
      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", staffCookie)
        .send({ firstName: "Other", lastName: "Customer" })
        .expect(201);
      const otherDoc = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", staffCookie)
        .send({ documentType: "CONTRACT", customerId: otherCustomer.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/portal/documents/${otherDoc.body.id}`)
        .set("Cookie", portalAccessCookie)
        .expect(404);
    });
  });

  describe("Extension requests", () => {
    async function activateRental(): Promise<void> {
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rentalId}/reserve`)
        .set("Cookie", staffCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rentalId}/start`)
        .set("Cookie", staffCookie)
        .send({})
        .expect(201);
    }

    it("submits a request and, once approved, genuinely extends the rental via RentalsService.extendPlannedEnd", async () => {
      await activateRental();
      const newEnd = dateOffset(10);

      const createResponse = await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: newEnd, message: "Need it a bit longer" })
        .expect(201);
      expect(createResponse.body.status).toBe("PENDING");

      const staffListResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/extension-requests`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(staffListResponse.body).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/extension-requests/${createResponse.body.id}/respond`)
        .set("Cookie", staffCookie)
        .send({ approve: true })
        .expect(201);

      const rentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(new Date(rentalResponse.body.plannedEnd).toISOString().slice(0, 10)).toBe(
        new Date(newEnd).toISOString().slice(0, 10),
      );

      const notificationsResponse = await request(app.getHttpServer())
        .get("/portal/notifications")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(
        notificationsResponse.body.some((n: { type: string }) => n.type === "EXTENSION_RESPONSE"),
      ).toBe(true);
    });

    it("rejects an extension request for a DRAFT rental", async () => {
      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: dateOffset(10) })
        .expect(409);
    });

    it("does not extend the rental when staff rejects the request", async () => {
      await activateRental();
      const originalRentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      const originalPlannedEnd = originalRentalResponse.body.plannedEnd;

      const createResponse = await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: dateOffset(10) })
        .expect(201);

      const respondResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/extension-requests/${createResponse.body.id}/respond`)
        .set("Cookie", staffCookie)
        .send({ approve: false, responseMessage: "Not available" })
        .expect(201);
      expect(respondResponse.body.status).toBe("REJECTED");

      const rentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(rentalResponse.body.plannedEnd).toBe(originalPlannedEnd);
    });

    // The following tests exercise the explicit date+time extension request
    // (see docs/DECISIONS.md D-116) — RentalExtensionRequest.requestedEnd is
    // already the canonical real-UTC-instant field (no schema change), so
    // every comparison below is a plain instant comparison, correct for any
    // tenant timezone with zero extra conversion at this layer.

    it("accepts a requestedEnd on the same calendar day as the current planned end, as long as the real instant is later", async () => {
      await activateRental();
      const rentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      const currentEnd = new Date(rentalResponse.body.plannedEnd);
      const laterSameDay = new Date(currentEnd.getTime() + 60 * 60 * 1000).toISOString();

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: laterSameDay })
        .expect(201);
    });

    it("rejects a requestedEnd exactly equal to the current planned end", async () => {
      await activateRental();
      const rentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: rentalResponse.body.plannedEnd })
        .expect(400);
    });

    it("rejects a requestedEnd earlier than the current planned end, even by a single hour on the same day", async () => {
      await activateRental();
      const rentalResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      const currentEnd = new Date(rentalResponse.body.plannedEnd);
      const earlierSameDay = new Date(currentEnd.getTime() - 60 * 60 * 1000).toISOString();

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: earlierSameDay })
        .expect(400);
    });

    it("rejects a bare offset-less local datetime string for requestedEnd (unambiguous API contract)", async () => {
      await activateRental();

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: "2026-09-01T12:30" })
        .expect(400);
    });

    it("rejects a requestedEnd that is not in the future, even when it is after an already-overdue planned end", async () => {
      await activateRental();
      const overduePlannedEnd = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await prisma.rental.update({
        where: { id: rentalId },
        data: { plannedEnd: overduePlannedEnd },
      });
      // After plannedEnd (still passes that check) but still in the past.
      const stillPast = new Date(overduePlannedEnd.getTime() + 60 * 60 * 1000).toISOString();

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: stillPast })
        .expect(400);
    });

    it("leaves the rental's planned end completely unchanged while a request is still PENDING", async () => {
      await activateRental();
      const before = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: dateOffset(10) })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rentalId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(after.body.plannedEnd).toBe(before.body.plannedEnd);
      expect(after.body.status).toBe(before.body.status);
    });

    it("404s submitting an extension request for a rental belonging to a different customer (public portal isolation)", async () => {
      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", staffCookie)
        .send({ firstName: "Other", lastName: "Customer" })
        .expect(201);
      const otherRental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", staffCookie)
        .send({
          customerId: otherCustomer.body.id,
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(4),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/portal/extension-requests/rentals/${otherRental.body.id}`)
        .set("Cookie", portalAccessCookie)
        .send({ requestedEnd: dateOffset(10) })
        .expect(404);
    });
  });

  describe("Damage reports", () => {
    it("submits a report, uploads a photo, and staff can review + convert it into a formal Document", async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/portal/damage-reports/rentals/${rentalId}`)
        .set("Cookie", portalAccessCookie)
        .send({ description: "Cracked panel on arrival", assetId })
        .expect(201);
      const reportId = createResponse.body.id;

      await request(app.getHttpServer())
        .post(`/portal/damage-reports/${reportId}/photos`)
        .set("Cookie", portalAccessCookie)
        .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), {
          filename: "damage.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);

      const staffListResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/damage-reports`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(staffListResponse.body).toHaveLength(1);
      expect(staffListResponse.body[0].photos).toHaveLength(1);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/damage-reports/${reportId}/review`)
        .set("Cookie", staffCookie)
        .send({ status: "REVIEWED" })
        .expect(201);

      const convertResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/damage-reports/${reportId}/convert`)
        .set("Cookie", staffCookie)
        .expect(201);
      expect(convertResponse.body.status).toBe("CONVERTED_TO_DOCUMENT");
      expect(convertResponse.body.convertedDocumentId).toBeTruthy();

      const documentResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/documents/${convertResponse.body.convertedDocumentId}`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(documentResponse.body.documentType).toBe("DAMAGE_REPORT");
    });
  });

  describe("Messages", () => {
    it("exchanges messages between customer and staff and tracks read state", async () => {
      await request(app.getHttpServer())
        .post("/portal/messages")
        .set("Cookie", portalAccessCookie)
        .send({ body: "Hi, question about my rental", rentalId })
        .expect(201);

      const staffListResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/customers/${customerId}/portal/messages`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(staffListResponse.body).toHaveLength(1);

      // The first GET is what performed the mark-as-read side effect, so it
      // still reflects the pre-read state; a second fetch observes the update.
      const staffListAgainResponse = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/customers/${customerId}/portal/messages`)
        .set("Cookie", staffCookie)
        .expect(200);
      expect(staffListAgainResponse.body[0].readByStaffAt).toBeTruthy();

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers/${customerId}/portal/messages`)
        .set("Cookie", staffCookie)
        .send({ body: "Sure, happy to help!", rentalId })
        .expect(201);

      const customerListResponse = await request(app.getHttpServer())
        .get("/portal/messages")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(customerListResponse.body).toHaveLength(2);

      const customerListAgainResponse = await request(app.getHttpServer())
        .get("/portal/messages")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(customerListAgainResponse.body[1].readByCustomerAt).toBeTruthy();

      const notificationsResponse = await request(app.getHttpServer())
        .get("/portal/notifications")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(notificationsResponse.body.some((n: { type: string }) => n.type === "MESSAGE")).toBe(
        true,
      );
    });
  });

  describe("Notifications", () => {
    it("marks a notification read and reflects it in the unread count", async () => {
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers/${customerId}/portal/messages`)
        .set("Cookie", staffCookie)
        .send({ body: "Reminder about your rental" })
        .expect(201);

      const beforeCount = await request(app.getHttpServer())
        .get("/portal/notifications/unread-count")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(beforeCount.body.count).toBe(1);

      const listResponse = await request(app.getHttpServer())
        .get("/portal/notifications")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      const notificationId = listResponse.body[0].id;

      await request(app.getHttpServer())
        .post(`/portal/notifications/${notificationId}/read`)
        .set("Cookie", portalAccessCookie)
        .expect(201);

      const afterCount = await request(app.getHttpServer())
        .get("/portal/notifications/unread-count")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(afterCount.body.count).toBe(0);
    });
  });

  describe("Assets", () => {
    it("returns equipment info without financial fields, for an asset the customer has rented", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portal/assets/${assetId}`)
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(response.body.name).toBe("Generator A");
      expect(response.body.purchasePriceMinor).toBeUndefined();
      expect(response.body.internalNumber).toBeUndefined();
    });

    it("404s for an asset the customer has never rented", async () => {
      const otherAsset = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/assets`)
        .set("Cookie", staffCookie)
        .send({
          name: "Generator B",
          internalNumber: "GEN-0002",
          categoryId: (
            await request(app.getHttpServer())
              .get(`/tenants/${tenantId}/asset-categories`)
              .set("Cookie", staffCookie)
          ).body.items[0].id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/portal/assets/${otherAsset.body.id}`)
        .set("Cookie", portalAccessCookie)
        .expect(404);
    });
  });

  describe("Dashboard", () => {
    it("aggregates counts across rentals, messages, notifications, signatures, and extension requests", async () => {
      const response = await request(app.getHttpServer())
        .get("/portal/dashboard")
        .set("Cookie", portalAccessCookie)
        .expect(200);
      expect(response.body).toMatchObject({
        currentRentalsCount: 0,
        upcomingRentalsCount: 0,
        unreadMessagesCount: 0,
        unreadNotificationsCount: 0,
        pendingSignatureRequestsCount: 0,
        pendingExtensionRequestsCount: 0,
      });
      expect(response.body.recentRentals).toHaveLength(1);
    });
  });

  describe("Tenant isolation", () => {
    it("keeps a portal session from one tenant from reading another tenant's data via the same customer email", async () => {
      const secondRegisterResponse = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          ...validRegisterPayload,
          email: "owner2@example.com",
          companyName: "Second Rentals Co",
        })
        .expect(201);
      const secondTenantId = secondRegisterResponse.body.tenant.id;
      const secondTenantSlug = secondRegisterResponse.body.tenant.slug;
      const secondStaffCookie = extractCookie(
        secondRegisterResponse.headers,
        "rentos_access_token",
      );

      const secondCustomerResponse = await request(app.getHttpServer())
        .post(`/tenants/${secondTenantId}/customers`)
        .set("Cookie", secondStaffCookie)
        .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
        .expect(201);

      const inviteResponse = await request(app.getHttpServer())
        .post(
          `/tenants/${secondTenantId}/customers/${secondCustomerResponse.body.id}/portal/invite`,
        )
        .set("Cookie", secondStaffCookie)
        .send({})
        .expect(201);
      const token = tokenFromInviteLink(inviteResponse.body.inviteLink);
      await request(app.getHttpServer())
        .post("/portal/auth/activate-invitation")
        .send({ token, password: "AnotherSecretPortal123" })
        .expect(200);

      // Same email, different tenant — logging into tenant A's slug with
      // tenant B's password (or vice versa) must never succeed.
      await request(app.getHttpServer())
        .post("/portal/auth/login")
        .send({ tenantSlug, email: "jane@example.com", password: "AnotherSecretPortal123" })
        .expect(401);
      await request(app.getHttpServer())
        .post("/portal/auth/login")
        .send({
          tenantSlug: secondTenantSlug,
          email: "jane@example.com",
          password: "SuperSecretPortal123",
        })
        .expect(401);

      // The tenant-A portal session must never see tenant-B's rental.
      await request(app.getHttpServer())
        .get("/portal/rentals")
        .set("Cookie", portalAccessCookie)
        .expect(200)
        .then((res) => {
          expect(res.body.items.every((r: { tenantId: string }) => r.tenantId === tenantId)).toBe(
            true,
          );
        });
    });
  });
});
