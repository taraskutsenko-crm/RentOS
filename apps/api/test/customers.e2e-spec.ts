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

describe("Customers E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;

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
  });

  function createCustomer(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "John", lastName: "Doe", ...overrides });
  }

  it("creates a customer with all fields", async () => {
    const response = await createCustomer({
      company: "Acme Inc",
      phone: "+1-555-1234",
      email: "john@acme.com",
      vatNumber: "US123456",
      address: "123 Main St",
      notes: "VIP customer",
    }).expect(201);

    expect(response.body).toMatchObject({
      tenantId,
      firstName: "John",
      lastName: "Doe",
      company: "Acme Inc",
      phone: "+1-555-1234",
      email: "john@acme.com",
      vatNumber: "US123456",
      address: "123 Main St",
      notes: "VIP customer",
      status: "ACTIVE",
    });
    expect(response.body.id).toBeTypeOf("string");
  });

  it("defaults status to ACTIVE and allows only firstName/lastName", async () => {
    const response = await createCustomer().expect(201);
    expect(response.body.status).toBe("ACTIVE");
    expect(response.body.company).toBeNull();
  });

  it("accepts empty strings for optional fields (as a real HTML form submits them), not just omitted keys", async () => {
    const response = await createCustomer({
      company: "",
      phone: "",
      email: "",
      vatNumber: "",
      address: "",
      notes: "",
    }).expect(201);

    expect(response.body.company).toBeNull();
    expect(response.body.phone).toBeNull();
    expect(response.body.email).toBeNull();
    expect(response.body.vatNumber).toBeNull();
    expect(response.body.address).toBeNull();
    expect(response.body.notes).toBeNull();
  });

  it("GET /customers/:id includes documents reflecting real Document.customerId links", async () => {
    const created = await createCustomer().expect(201);

    const noDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(noDocuments.body.documents).toEqual([]);

    const document = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId: created.body.id })
      .expect(201);

    const deletedDocument = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId: created.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${deletedDocument.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const withDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(withDocuments.body.documents).toHaveLength(1);
    expect(withDocuments.body.documents[0]).toMatchObject({
      id: document.body.id,
      documentType: "CONTRACT",
    });
  });

  it("clearing a field via PATCH (empty string) actually nulls it out, not leaves the old value", async () => {
    const created = await createCustomer({ company: "Acme Inc", email: "a@b.com" }).expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ company: "", email: "" })
      .expect(200);

    expect(response.body.company).toBeNull();
    expect(response.body.email).toBeNull();
  });

  it("rejects creation with a missing required field", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ lastName: "NoFirstName" })
      .expect(400);

    const count = await prisma.customer.count();
    expect(count).toBe(0);
  });

  it("rejects creation with an invalid email", async () => {
    await createCustomer({ email: "not-an-email" }).expect(400);
  });

  it("gets a single customer by id", async () => {
    const created = await createCustomer().expect(201);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.id).toBe(created.body.id);
  });

  it("returns 404 for a nonexistent customer id", async () => {
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/00000000-0000-0000-0000-000000000000`)
      .set("Cookie", accessCookie)
      .expect(404);
  });

  it("updates a customer", async () => {
    const created = await createCustomer().expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ phone: "+1-555-9999", notes: "Updated" })
      .expect(200);

    expect(response.body.phone).toBe("+1-555-9999");
    expect(response.body.notes).toBe("Updated");
    expect(response.body.firstName).toBe("John");
  });

  it("soft-deletes a customer, which then 404s and is excluded from listings", async () => {
    const created = await createCustomer().expect(201);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(404);

    const listResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(listResponse.body.items).toHaveLength(0);

    const row = await prisma.customer.findUnique({ where: { id: created.body.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("searches across firstName, lastName, company, email, and phone", async () => {
    await createCustomer({ firstName: "Alice", lastName: "Anderson", company: "Acme Inc" });
    await createCustomer({ firstName: "Bob", lastName: "Brown", email: "bob@other.com" });

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .query({ search: "acme" })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].company).toBe("Acme Inc");
  });

  it("searches correctly across non-Latin and accented Unicode names (globalization Section 12)", async () => {
    // Representative of the 14 shipped UI locales' scripts — French accents,
    // Polish diacritics, Ukrainian Cyrillic, German umlauts, and CJK ideographs
    // — verifying Prisma's `contains`+`mode:"insensitive"` (Postgres ILIKE)
    // matches correctly without any locale-specific search logic.
    await createCustomer({
      firstName: "François",
      lastName: "Kowalski",
      company: "Société Général",
    });
    await createCustomer({ firstName: "Małgorzata", lastName: "Żółć", company: "Zażółć Sp." });
    await createCustomer({ firstName: "Олена", lastName: "Шевченко", company: "Компанія" });
    await createCustomer({ firstName: "Jürgen", lastName: "Müller", company: "Größe GmbH" });
    await createCustomer({ firstName: "田中", lastName: "太郎", company: "株式会社" });

    const cases: Array<{ search: string; expectedCompany: string }> = [
      { search: "françois", expectedCompany: "Société Général" },
      { search: "żółć", expectedCompany: "Zażółć Sp." },
      { search: "шевченко", expectedCompany: "Компанія" },
      { search: "müller", expectedCompany: "Größe GmbH" },
      { search: "太郎", expectedCompany: "株式会社" },
    ];

    for (const { search, expectedCompany } of cases) {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/customers`)
        .query({ search })
        .set("Cookie", accessCookie)
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].company).toBe(expectedCompany);
    }
  });

  it("allows creating two customers with the same email, VAT number, and company (no uniqueness rule)", async () => {
    // Regression test for a reported "Something went wrong" customer-
    // creation failure: the actual root cause was a stale frontend tenant
    // context (see apps/web/src/hooks/use-ensure-tenant-context.ts), never
    // a duplicate-data rejection — Customer has no @unique constraint on
    // email/vatNumber/company/name (schema.prisma), and CustomersService
    // .create() performs no pre-check. This test documents that intentional
    // behavior so a future change doesn't accidentally introduce one.
    const first = await createCustomer({
      firstName: "Dima",
      lastName: "Demchenko",
      company: "UnitCore",
      email: "unitcore@gmail.com",
      vatNumber: "9542784422",
    }).expect(201);

    const second = await createCustomer({
      firstName: "Dima",
      lastName: "Demchenko",
      company: "UnitCore",
      email: "unitcore@gmail.com",
      vatNumber: "9542784422",
    }).expect(201);

    expect(second.body.id).not.toBe(first.body.id);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .query({ search: "unitcore@gmail.com" })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(list.body.items).toHaveLength(2);
  });

  it("a newly created customer appears in the list immediately (no caching/visibility lag)", async () => {
    const created = await createCustomer({ firstName: "Fresh", lastName: "Record" }).expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });

  it("never leaks a customer across tenants — a second tenant's registration cannot see or recreate it", async () => {
    await createCustomer({
      firstName: "Dima",
      lastName: "Demchenko",
      email: "cross-tenant@example.com",
    }).expect(201);

    const otherTenant = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "second-owner@example.com" })
      .expect(201);
    const otherTenantId = (otherTenant.body as RegisterResponseBody).tenant.id;
    const otherCookie = extractCookie(otherTenant.headers, "rentos_access_token");

    const otherList = await request(app.getHttpServer())
      .get(`/tenants/${otherTenantId}/customers`)
      .set("Cookie", otherCookie)
      .expect(200);
    expect(otherList.body.items).toHaveLength(0);

    // The same email/name creates a distinct record under the new tenant —
    // tenant isolation, not a cross-tenant uniqueness rule.
    const otherCreated = await request(app.getHttpServer())
      .post(`/tenants/${otherTenantId}/customers`)
      .set("Cookie", otherCookie)
      .send({ firstName: "Dima", lastName: "Demchenko", email: "cross-tenant@example.com" })
      .expect(201);
    expect(otherCreated.body.tenantId).toBe(otherTenantId);

    // And the original tenant's request using the second tenant's id (a
    // literal reproduction of the reported bug's request shape) is
    // rejected, never silently redirected to the wrong tenant's data.
    await request(app.getHttpServer())
      .post(`/tenants/${otherTenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Should", lastName: "Fail" })
      .expect(403);
  });

  it("filters by status", async () => {
    await createCustomer({ firstName: "Active", status: "ACTIVE" });
    await createCustomer({ firstName: "Inactive", status: "INACTIVE" });

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .query({ status: "INACTIVE" })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].firstName).toBe("Inactive");
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i += 1) {
      await createCustomer({ firstName: `Customer${i}` });
    }

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .query({ page: 2, pageSize: 2 })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(5);
    expect(response.body.page).toBe(2);
    expect(response.body.pageSize).toBe(2);
  });

  it("rejects anonymous access", async () => {
    await request(app.getHttpServer()).get(`/tenants/${tenantId}/customers`).expect(401);
  });

  it("rejects access from a user without membership in the tenant", async () => {
    const otherResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other@example.com", companyName: "Other Co" })
      .expect(201);
    const otherCookie = extractCookie(otherResponse.headers, "rentos_access_token");

    const created = await createCustomer().expect(201);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers`)
      .set("Cookie", otherCookie)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", otherCookie)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", otherCookie)
      .send({ notes: "hijacked" })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", otherCookie)
      .expect(403);
  });

  it("logs an audit entry for create, update, and delete", async () => {
    const created = await createCustomer().expect(201);
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ notes: "x" })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const actions = await prisma.auditLog.findMany({
      where: { entityType: "Customer", entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "customer.created",
      "customer.updated",
      "customer.deleted",
    ]);
  });

  it("timeline() reflects create/update in order and rejects access from another tenant's member", async () => {
    const created = await createCustomer().expect(201);
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ notes: "x" })
      .expect(200);

    const timeline = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}/timeline`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(timeline.body.map((event: { type: string }) => event.type)).toEqual([
      "created",
      "updated",
    ]);

    const otherResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        ...validRegisterPayload,
        email: "other-timeline@example.com",
        companyName: "Other Co",
      })
      .expect(201);
    const otherCookie = extractCookie(otherResponse.headers, "rentos_access_token");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}/timeline`)
      .set("Cookie", otherCookie)
      .expect(403);
  });

  it("summary() reflects a real customer with no rentals yet", async () => {
    const created = await createCustomer().expect(201);

    const summary = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}/summary`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(summary.body).toMatchObject({
      totalRentals: 0,
      activeRentals: 0,
      totalRevenueMinor: 0,
      currency: null,
      damageReportsCount: 0,
    });
    expect(summary.body.customerSince).toBeTruthy();
    expect(summary.body.lastActivityAt).toBeTruthy();
  });
});
