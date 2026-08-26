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

describe("Rental -> Generate Commercial Quote E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
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
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Generators" })
      .expect(201);
    const categoryId = categoryResponse.body.id;

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;
  });

  function dateOffset(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  function createRental(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [
          {
            assetId,
            billingMode: "DAILY",
            dailyPriceMinor: 5000,
            taxRateBp: 2300,
            depositMinor: 70000,
            discountMinor: 1000,
          },
        ],
        ...overrides,
      });
  }

  it("creates a real canonical Quote from a Rental, with matching customer/dates/assets/pricing/deposit", async () => {
    const rental = await createRental().expect(201);
    const rentalId = rental.body.id as string;

    const quote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rentalId}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(quote.body.quoteNumber).toMatch(/^Q-\d{4}-\d{6}$/);
    expect(quote.body.customerId).toBe(customerId);
    expect(quote.body.currency).toBe("USD");
    expect(quote.body.plannedStart.slice(0, 10)).toBe(dateOffset(1).slice(0, 10));
    expect(quote.body.plannedEnd.slice(0, 10)).toBe(dateOffset(4).slice(0, 10));
    expect(quote.body.sourceRental).toMatchObject({ id: rentalId });
    expect(quote.body.status).toBe("DRAFT");

    expect(quote.body.items).toHaveLength(1);
    const item = quote.body.items[0];
    expect(item.itemType).toBe("ASSET");
    expect(item.asset.id).toBe(assetId);
    expect(item.billingMode).toBe("DAILY");
    expect(item.dailyPriceMinor).toBe(5000);
    expect(item.taxRateBp).toBe(2300);
    expect(item.depositMinor).toBe(70000);
    expect(item.discountType).toBe("FIXED");
    expect(item.discountValue).toBe(1000);

    // 3 days * 5000 = 15000 subtotal, minus 1000 item discount = 14000,
    // 23% tax = 3220 -> matches the exact same computeQuoteTotals formula
    // rental-pricing.util's own computeRentalTotals would produce for the
    // same inputs (see quote-pricing.util.ts's shared duration/tax helpers).
    expect(item.lineSubtotalMinor).toBe(15000);
    expect(item.discountTotalMinor).toBe(1000);
    expect(item.taxTotalMinor).toBe(3220);
    expect(item.lineTotalMinor).toBe(17220);
    expect(quote.body.totalMinor).toBe(17220);
    expect(quote.body.depositTotalMinor).toBe(70000);
  });

  it("is idempotent — a repeat call returns the already-generated Quote instead of a duplicate", async () => {
    const rental = await createRental().expect(201);
    const rentalId = rental.body.id as string;

    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rentalId}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rentalId}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("rejects generating a quote from a rental with no items", async () => {
    const rental = await createRental({ items: [] }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rental.body.id}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(400);
  });

  it("404s for a rental in a different tenant", async () => {
    const rental = await createRental().expect(201);

    const otherRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = otherRegister.body as RegisterResponseBody;
    const otherCookie = extractCookie(otherRegister.headers, "rentos_access_token");

    await request(app.getHttpServer())
      .post(`/tenants/${otherBody.tenant.id}/quotes/from-rental/${rental.body.id}`)
      .set("Cookie", otherCookie)
      .send({})
      .expect(404);
  });

  it("appears in the main Quotes list", async () => {
    const rental = await createRental().expect(201);
    const generated = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rental.body.id}`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(list.body.items.map((q: { id: string }) => q.id)).toContain(generated.body.id);
  });

  it("blocks a VIEWER-role member from generating a quote (quotes.create required)", async () => {
    const rental = await createRental().expect(201);

    const viewerRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "viewer@example.com", companyName: "Viewer Co" })
      .expect(201);
    const viewerBody = viewerRegister.body as RegisterResponseBody;
    const viewerCookie = extractCookie(viewerRegister.headers, "rentos_access_token");

    await prisma.tenantMembership.create({
      data: { tenantId, userId: viewerBody.user.id, role: "VIEWER", status: "ACTIVE" },
    });

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/from-rental/${rental.body.id}`)
      .set("Cookie", viewerCookie)
      .send({})
      .expect(403);
  });
});
