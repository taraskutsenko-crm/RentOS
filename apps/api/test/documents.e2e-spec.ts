import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

describe("Documents E2E (TASK-0008 Part 1 — Document Management Platform)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let assetId: string;
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
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Generators" })
      .expect(201);

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({
        name: "Generator A",
        internalNumber: "GEN-0001",
        categoryId: categoryResponse.body.id,
      })
      .expect(201);
    assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;

    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({ customerId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4) })
      .expect(201);
    rentalId = rentalResponse.body.id;
  });

  function dateOffset(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  function createDocument(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, title: "Rental contract", ...overrides });
  }

  async function createAndFinalize(overrides: Record<string, unknown> = {}) {
    const created = await createDocument(overrides).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    return created.body.id as string;
  }

  async function createSendAndSign(overrides: Record<string, unknown> = {}) {
    const id = await createAndFinalize(overrides);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/sign`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    return id;
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
  // CRUD + numbering
  // ---------------------------------------------------------------------

  it("creates a DRAFT CONTRACT document with a CON-###### number and version 1 unfinalized", async () => {
    const response = await createDocument().expect(201);
    expect(response.body.documentNumber).toBe("CON-000001");
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.currentVersionNumber).toBe(1);
    expect(response.body.versions).toHaveLength(1);
    expect(response.body.versions[0].versionNumber).toBe(1);
    expect(response.body.versions[0].isFinal).toBe(false);
    expect(response.body.versions[0].finalizedAt).toBeNull();
  });

  it("auto-inherits customerId from the linked Rental when customerId is omitted", async () => {
    const response = await createDocument({ customerId: undefined, rentalId }).expect(201);
    expect(response.body.rentalId).toBe(rentalId);
    expect(response.body.customerId).toBe(customerId);
  });

  it("auto-populates quoteId from the Rental's sourceQuoteId when quoteId is omitted", async () => {
    const quoteResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
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
    const quoteId = quoteResponse.body.id as string;
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
    const converted = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const convertedRentalId = converted.body.rental.id as string;

    // The actual fix for the reported blank rental.number/total/start/end
    // bug: linking rentalId is what makes those variables resolve at all
    // (see DECISIONS.md D-060) — and the Quote this Rental was converted
    // from is now traceable automatically via the pre-existing
    // Document.quoteId FK, with zero new relation models.
    const response = await createDocument({
      customerId: undefined,
      rentalId: convertedRentalId,
    }).expect(201);
    expect(response.body.rentalId).toBe(convertedRentalId);
    expect(response.body.quoteId).toBe(quoteId);
  });

  it("respects an explicitly provided quoteId over the Rental's own sourceQuoteId", async () => {
    const otherQuote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
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

    // rentalId (from beforeEach) has no sourceQuote at all; an explicit
    // quoteId must still be honored (never overwritten by a null
    // rental.sourceQuoteId).
    const response = await createDocument({ rentalId, quoteId: otherQuote.body.id }).expect(201);
    expect(response.body.quoteId).toBe(otherQuote.body.id);
  });

  it("auto-populates quoteId from the Rental's generatedQuote (canonical Quote generated FROM this Rental)", async () => {
    // The opposite direction from sourceQuoteId above: this Rental was
    // never converted from a quote, but staff used "Generate Commercial
    // Quote" to create a real canonical Quote FROM it (see
    // QuotesService.createFromRental, DECISIONS.md D-106). Needs a rental
    // with at least one item — the shared `rentalId` from beforeEach has
    // none, so build a dedicated one here.
    const itemRental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    const itemRentalId = itemRental.body.id as string;

    const generated = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${itemRentalId}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const generatedQuoteId = generated.body.id as string;

    const response = await createDocument({
      customerId: undefined,
      rentalId: itemRentalId,
    }).expect(201);
    expect(response.body.rentalId).toBe(itemRentalId);
    expect(response.body.quoteId).toBe(generatedQuoteId);
  });

  it("defaults employeeUserId to the creating staff user when omitted", async () => {
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", accessCookie)
      .expect(200);
    const response = await createDocument().expect(201);
    expect(response.body.employeeUserId).toBe(me.body.user.id);
  });

  it("rejects a CUSTOM document with no customTypeName", async () => {
    await createDocument({ documentType: "CUSTOM", customTypeName: undefined }).expect(400);
  });

  it("rejects customTypeName on a non-CUSTOM document", async () => {
    await createDocument({ documentType: "CONTRACT", customTypeName: "Whatever" }).expect(400);
  });

  it("formats a CUSTOM document as DOC-<year>-######", async () => {
    const response = await createDocument({
      documentType: "CUSTOM",
      customTypeName: "Inspection Checklist",
    }).expect(201);
    const year = new Date().getUTCFullYear();
    expect(response.body.documentNumber).toBe(`DOC-${year}-000001`);
  });

  it("issues sequential numbers per documentType, independently of other types", async () => {
    const contract1 = await createDocument({ documentType: "CONTRACT" }).expect(201);
    const handover1 = await createDocument({ documentType: "HANDOVER_PROTOCOL", assetId }).expect(
      201,
    );
    const contract2 = await createDocument({ documentType: "CONTRACT" }).expect(201);

    expect(contract1.body.documentNumber).toBe("CON-000001");
    expect(handover1.body.documentNumber).toBe("HD-000001");
    expect(contract2.body.documentNumber).toBe("CON-000002");
  });

  it("keeps separate, independent document counters per tenant", async () => {
    await createDocument().expect(201);
    await createDocument().expect(201);

    const other = await registerSecondTenant();
    const otherCustomer = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/customers`)
      .set("Cookie", other.cookie)
      .send({ firstName: "John", lastName: "Smith" })
      .expect(201);

    const otherDoc = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/documents`)
      .set("Cookie", other.cookie)
      .send({ documentType: "CONTRACT", customerId: otherCustomer.body.id })
      .expect(201);
    expect(otherDoc.body.documentNumber).toBe("CON-000001");
  });

  it("never issues a duplicate document number under concurrent creation (20 simultaneous requests)", async () => {
    const concurrency = 20;
    const responses = await Promise.all(
      Array.from({ length: concurrency }, () => createDocument()),
    );
    const numbers = responses.map((response) => {
      expect(response.status).toBe(201);
      return response.body.documentNumber as string;
    });
    expect(new Set(numbers).size).toBe(concurrency);
  });

  it("stores businessData and items on version 1", async () => {
    const response = await createDocument({
      rentalId,
      businessData: { partyA: "Acme Rentals", partyB: "Jane Doe" },
      items: [{ assetId, description: "Generator A", data: { conditionAtHandover: "good" } }],
    }).expect(201);

    expect(response.body.versions[0].businessDataSnapshot).toEqual({
      partyA: "Acme Rentals",
      partyB: "Jane Doe",
    });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].description).toBe("Generator A");
    expect(response.body.items[0].dataJson).toEqual({ conditionAtHandover: "good" });
  });

  it("updates a DRAFT document's businessData and items in place, without creating a new version", async () => {
    const created = await createDocument({ businessData: { v: 1 } }).expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ title: "Updated title", businessData: { v: 2 }, items: [{ assetId }] })
      .expect(200);

    expect(updated.body.title).toBe("Updated title");
    expect(updated.body.versions).toHaveLength(1);
    expect(updated.body.versions[0].versionNumber).toBe(1);
    expect(updated.body.versions[0].businessDataSnapshot).toEqual({ v: 2 });
    expect(updated.body.items).toHaveLength(1);
  });

  it("rejects updating a document once it has left DRAFT", async () => {
    const id = await createAndFinalize();
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/documents/${id}`)
      .set("Cookie", accessCookie)
      .send({ title: "Should not apply" })
      .expect(409);
  });

  it("deletes a DRAFT document but rejects deleting a READY one", async () => {
    const draft = await createDocument().expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${draft.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const readyId = await createAndFinalize();
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${readyId}`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  it("rejects cross-tenant document access", async () => {
    const created = await createDocument().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .get(`/tenants/${other.tenantId}/documents/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(404);
  });

  it("lists documents with type/status/search filters", async () => {
    await createDocument({ documentType: "CONTRACT", title: "Alpha contract" }).expect(201);
    await createDocument({
      documentType: "HANDOVER_PROTOCOL",
      assetId,
      title: "Beta handover",
    }).expect(201);

    const byType = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents?documentType=CONTRACT`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(byType.body.total).toBe(1);
    expect(byType.body.items[0].documentType).toBe("CONTRACT");

    const bySearch = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents?search=Beta`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(bySearch.body.total).toBe(1);
    expect(bySearch.body.items[0].title).toBe("Beta handover");
  });

  // ---------------------------------------------------------------------
  // Status transitions + finalization
  // ---------------------------------------------------------------------

  it("transitions DRAFT -> READY and finalizes version 1 (isFinal, finalizedAt set)", async () => {
    const created = await createDocument().expect(201);
    const ready = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(ready.body.status).toBe("READY");
    expect(ready.body.versions[0].isFinal).toBe(true);
    expect(ready.body.versions[0].finalizedAt).not.toBeNull();
  });

  it("rejects an invalid transition (DRAFT -> SENT directly, skipping READY)", async () => {
    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  it("rejects archiving a document that has not reached a terminal state", async () => {
    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/archive`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  it("runs the full lifecycle DRAFT -> READY -> SENT -> VIEWED -> SIGNED -> ARCHIVED", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;
    const http = request(app.getHttpServer());

    await http
      .post(`/tenants/${tenantId}/documents/${id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await http
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await http
      .post(`/tenants/${tenantId}/documents/${id}/viewed`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const signed = await http
      .post(`/tenants/${tenantId}/documents/${id}/sign`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(signed.body.status).toBe("SIGNED");

    const archived = await http
      .post(`/tenants/${tenantId}/documents/${id}/archive`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(archived.body.status).toBe("ARCHIVED");
  });

  it("supports PARTIALLY_SIGNED before SIGNED", async () => {
    const id = await createAndFinalize();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const partial = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/sign?full=false`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(partial.body.status).toBe("PARTIALLY_SIGNED");

    const full = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/sign`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(full.body.status).toBe("SIGNED");
  });

  it("rejects a document via the reject action", async () => {
    const id = await createAndFinalize();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/reject`)
      .set("Cookie", accessCookie)
      .send({ reason: "Terms not acceptable" })
      .expect(201);
    expect(rejected.body.status).toBe("REJECTED");
  });

  it("voids a document from DRAFT", async () => {
    const created = await createDocument().expect(201);
    const voided = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/void`)
      .set("Cookie", accessCookie)
      .send({ reason: "No longer needed" })
      .expect(201);
    expect(voided.body.status).toBe("VOIDED");
  });

  it("is idempotent when transitioning to the same status twice", async () => {
    const created = await createDocument().expect(201);
    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(first.body.status).toBe("READY");
    expect(second.body.status).toBe("READY");
  });

  // ---------------------------------------------------------------------
  // Versioning / immutability
  // ---------------------------------------------------------------------

  it("rejects creating a correction version while still DRAFT", async () => {
    const created = await createDocument().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/versions`)
      .set("Cookie", accessCookie)
      .send({ reason: "Too early" })
      .expect(409);
  });

  it("creates a correction version after finalization, preserving the original version immutably", async () => {
    const id = await createAndFinalize({ businessData: { total: 100 } });

    const corrected = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/versions`)
      .set("Cookie", accessCookie)
      .send({ reason: "Fixed a typo in the total", businessData: { total: 150 } })
      .expect(201);

    expect(corrected.body.status).toBe("DRAFT");
    expect(corrected.body.currentVersionNumber).toBe(2);
    expect(corrected.body.versions).toHaveLength(2);

    const v1 = corrected.body.versions.find(
      (v: { versionNumber: number }) => v.versionNumber === 1,
    );
    const v2 = corrected.body.versions.find(
      (v: { versionNumber: number }) => v.versionNumber === 2,
    );
    expect(v1.isFinal).toBe(true);
    expect(v1.businessDataSnapshot).toEqual({ total: 100 });
    expect(v2.isFinal).toBe(false);
    expect(v2.parentVersionId).toBe(v1.id);
    expect(v2.businessDataSnapshot).toEqual({ total: 150 });
    expect(v2.reason).toBe("Fixed a typo in the total");
  });

  it("carries the current version's business data forward verbatim when a correction omits businessData", async () => {
    const id = await createAndFinalize({ businessData: { total: 100 } });
    const corrected = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/versions`)
      .set("Cookie", accessCookie)
      .send({ reason: "Just re-finalizing" })
      .expect(201);

    const v2 = corrected.body.versions.find(
      (v: { versionNumber: number }) => v.versionNumber === 2,
    );
    expect(v2.businessDataSnapshot).toEqual({ total: 100 });
  });

  // ---------------------------------------------------------------------
  // Files (Storage layer)
  // ---------------------------------------------------------------------

  it("uploads an ATTACHMENT file to the current version and can download it back", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;

    const uploadResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "ATTACHMENT")
      .attach("file", Buffer.from("%PDF-1.4 fake pdf content"), {
        filename: "signed-copy.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    expect(uploadResponse.body.format).toBe("ATTACHMENT");

    const downloadResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}/file`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(Buffer.from(downloadResponse.body as Buffer).toString()).toContain("fake pdf content");

    const history = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/history`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(history.body.some((event: { type: string }) => event.type === "file_uploaded")).toBe(
      true,
    );
    expect(history.body.some((event: { type: string }) => event.type === "downloaded")).toBe(true);
  });

  it("accepts an optional category and caption and returns them verbatim", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;

    const uploadResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "PHOTO")
      .field("category", "HANDOVER_CONDITION")
      .field("caption", "Front bumper, minor scratch")
      .attach("file", Buffer.from("fake image bytes"), {
        filename: "handover-1.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);
    expect(uploadResponse.body.category).toBe("HANDOVER_CONDITION");
    expect(uploadResponse.body.caption).toBe("Front bumper, minor scratch");
  });

  // Production-infrastructure pass (D-1xx): staff-uploaded evidence must be
  // exactly as immutable as the rest of a finalized document's content.
  it("rejects uploading or removing a file once the document has been finalized (left DRAFT)", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;

    const uploadResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "ATTACHMENT")
      .attach("file", Buffer.from("draft-era file"), {
        filename: "draft.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/ready`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "ATTACHMENT")
      .attach("file", Buffer.from("post-finalize file"), {
        filename: "late.pdf",
        contentType: "application/pdf",
      })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  it("denies a different tenant from uploading, downloading, or deleting another tenant's document files", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;
    const uploadResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "ATTACHMENT")
      .attach("file", Buffer.from("tenant A file"), {
        filename: "a.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    const otherTenant = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-tenant-files@example.com" })
      .expect(201);
    const otherTenantId = (otherTenant.body as RegisterResponseBody).tenant.id;
    const otherCookie = extractCookie(otherTenant.headers, "rentos_access_token");

    // Tenant B has no membership in tenant A's tenantId at all — TenantGuard
    // itself denies before any document is looked up (see ARCHITECTURE_LOCK
    // §1.2 / tenant.guard.ts).
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}/file`)
      .set("Cookie", otherCookie)
      .expect(403);

    // Tenant B using their OWN (real) tenantId but referencing tenant A's
    // document/file id — passes TenantGuard, then DocumentFilesService's
    // own tenant-scoped Prisma lookup finds nothing: existence is never
    // leaked across tenants, so this is 404, not 403 (§1.2).
    await request(app.getHttpServer())
      .get(`/tenants/${otherTenantId}/documents/${id}/files/${uploadResponse.body.id}/file`)
      .set("Cookie", otherCookie)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/tenants/${otherTenantId}/documents/${id}/files`)
      .set("Cookie", otherCookie)
      .field("format", "ATTACHMENT")
      .attach("file", Buffer.from("tenant B file"), {
        filename: "b.pdf",
        contentType: "application/pdf",
      })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/tenants/${otherTenantId}/documents/${id}/files/${uploadResponse.body.id}`)
      .set("Cookie", otherCookie)
      .expect(404);

    // Tenant A's own file must remain completely intact after all of the above.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}/file`)
      .set("Cookie", accessCookie)
      .expect(200);
  });

  it("soft-deletes a file, after which download returns 404", async () => {
    const created = await createDocument().expect(201);
    const id = created.body.id as string;

    const uploadResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${id}/files`)
      .set("Cookie", accessCookie)
      .field("format", "PHOTO")
      .attach("file", Buffer.from("fake image bytes"), {
        filename: "damage.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/files/${uploadResponse.body.id}/file`)
      .set("Cookie", accessCookie)
      .expect(404);
  });

  // ---------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------

  it("returns a chronological timeline covering creation, status changes, and named events", async () => {
    const id = await createSendAndSign();

    const history = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${id}/history`)
      .set("Cookie", accessCookie)
      .expect(200);

    const types = history.body.map((event: { type: string }) => event.type);
    expect(types).toContain("created");
    expect(types).toContain("sent");
    expect(types).toContain("signed");
    expect(types).toContain("status_changed");

    const timestamps = history.body.map((event: { occurredAt: string }) => event.occurredAt);
    expect([...timestamps].sort()).toEqual(timestamps);
  });

  // ---------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------

  it("blocks a VIEWER-role member from create/update/send but allows view/download", async () => {
    const created = await createDocument().expect(201);
    const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", viewerCookie)
      .send({ documentType: "CONTRACT", customerId })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/send`)
      .set("Cookie", viewerCookie)
      .send({})
      .expect(403);
  });

  it("allows TECHNICIAN to create/update/view/download but blocks send/sign/void/archive", async () => {
    const techCookie = await createMemberWithRole("TECHNICIAN", "tech@example.com");

    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", techCookie)
      .send({ documentType: "HANDOVER_PROTOCOL", assetId, rentalId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", techCookie)
      .send({ title: "Handover notes" })
      .expect(200);

    // markReady is gated under documents.update, which TECHNICIAN has.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/ready`)
      .set("Cookie", techCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${created.body.id}/send`)
      .set("Cookie", techCookie)
      .send({})
      .expect(403);
  });

  it("restricts ACCOUNTANT to view/download only", async () => {
    const created = await createDocument().expect(201);
    const accountantCookie = await createMemberWithRole("ACCOUNTANT", "accountant@example.com");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/documents/${created.body.id}`)
      .set("Cookie", accountantCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accountantCookie)
      .send({ documentType: "CONTRACT", customerId })
      .expect(403);
  });

  it("logs an audit entry for every lifecycle step", async () => {
    const id = await createSendAndSign();
    const logs = await prisma.auditLog.findMany({
      where: { tenantId, entityType: "Document", entityId: id },
    });
    const actions = logs.map((log) => log.action);
    expect(actions).toContain("document.created");
    expect(actions).toContain("document.sent");
    expect(actions).toContain("document.signed");
  });
});
