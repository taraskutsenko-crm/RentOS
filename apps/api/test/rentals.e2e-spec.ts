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

describe("Rentals E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let assetAId: string;
  let assetBId: string;

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

    const assetA = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    assetAId = assetA.body.id;

    const assetB = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator B", internalNumber: "GEN-0002", categoryId })
      .expect(201);
    assetBId = assetB.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe" })
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
        items: [{ assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
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

  // 1. Create rental successfully with computed totals (pricing test: DAILY)
  it("creates a rental in DRAFT status with computed DAILY totals", async () => {
    const response = await createRental().expect(201);

    expect(response.body).toMatchObject({
      tenantId,
      customerId,
      status: "DRAFT",
      subtotalMinor: 3000, // 3 days * 1000
      totalMinor: 3000,
    });
    expect(response.body.rentalNumber).toMatch(/^RNT-\d{6}$/);
    expect(response.body.items).toHaveLength(1);
  });

  // 2. Pricing test: WEEKLY
  it("computes WEEKLY pricing with ceil(days/7)", async () => {
    const response = await createRental({
      plannedStart: dateOffset(1),
      plannedEnd: dateOffset(10), // 9 days -> 2 weeks
      items: [{ assetId: assetAId, billingMode: "WEEKLY", weeklyPriceMinor: 5000 }],
    }).expect(201);

    expect(response.body.subtotalMinor).toBe(10000);
  });

  // 3. Pricing test: CUSTOM ignores quantity/duration, plus rental-level discount/tax
  it("computes CUSTOM pricing as a flat price and applies rental-level discount/tax", async () => {
    const response = await createRental({
      items: [{ assetId: assetAId, billingMode: "CUSTOM", customPriceMinor: 50000, quantity: 3 }],
      discountMinor: 5000,
      taxMinor: 1000,
    }).expect(201);

    expect(response.body.subtotalMinor).toBe(50000);
    expect(response.body.totalMinor).toBe(50000 - 5000 + 1000);
  });

  function isoDaysAfter(base: string, days: number): string {
    const date = new Date(base);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  describe("MONTHLY billing strategy (ADR 0008)", () => {
    it("defaults to CALENDAR_MONTH: splits complete calendar months plus remaining days", async () => {
      // Jan 15 -> Mar 20: 2 complete months (Jan15->Mar15) + 5 remaining days
      const response = await createRental({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            assetId: assetAId,
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(20000 * 2 + 1000 * 5);
    });

    it("rejects a MONTHLY item missing dailyPriceMinor (needed for any remainder)", async () => {
      await createRental({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [{ assetId: assetAId, billingMode: "MONTHLY", monthlyPriceMinor: 20000 }],
      }).expect(400);
    });

    it("uses FIXED_30_DAYS once configured on tenant settings", async () => {
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
        .expect(200);

      const start = "2030-01-01T00:00:00.000Z";
      const response = await createRental({
        plannedStart: start,
        plannedEnd: isoDaysAfter(start, 65), // 65 days -> 2 x 30-day units + 5 remaining
        items: [
          {
            assetId: assetAId,
            billingMode: "MONTHLY",
            monthlyPriceMinor: 30000,
            dailyPriceMinor: 900,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(30000 * 2 + 900 * 5);
    });

    it("uses CUSTOM with customMonthLengthDays once configured on tenant settings", async () => {
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({ monthlyBillingStrategy: "CUSTOM", customMonthLengthDays: 28 })
        .expect(200);

      const start = "2030-01-01T00:00:00.000Z";
      const response = await createRental({
        plannedStart: start,
        plannedEnd: isoDaysAfter(start, 60), // 60 days, length 28 -> 2 units + 4 remaining
        items: [
          {
            assetId: assetAId,
            billingMode: "MONTHLY",
            monthlyPriceMinor: 28000,
            dailyPriceMinor: 800,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(28000 * 2 + 800 * 4);
    });

    it("snapshots the strategy at creation time — a later tenant settings change never alters the stored total", async () => {
      const created = await createRental({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            assetId: assetAId,
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);
      const originalTotal = created.body.totalMinor as number;
      expect(originalTotal).toBe(20000 * 2 + 1000 * 5);

      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
        .expect(200);

      const refetched = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${created.body.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(refetched.body.totalMinor).toBe(originalTotal);
      expect(refetched.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");

      // An unrelated edit that doesn't touch items must also keep the frozen strategy.
      const updated = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rentals/${created.body.id}`)
        .set("Cookie", accessCookie)
        .send({ notes: "updated notes" })
        .expect(200);
      expect(updated.body.totalMinor).toBe(originalTotal);
      expect(updated.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");
    });

    it("an explicit item replacement picks up the tenant's current settings (intentional reprice)", async () => {
      const created = await createRental({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            assetId: assetAId,
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
        .expect(200);

      // Jan 15 -> Mar 20 is 64 days -> under FIXED_30_DAYS: 2 x 30-day units + 4 remaining.
      const repriced = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rentals/${created.body.id}`)
        .set("Cookie", accessCookie)
        .send({
          items: [
            {
              assetId: assetAId,
              billingMode: "MONTHLY",
              monthlyPriceMinor: 20000,
              dailyPriceMinor: 1000,
            },
          ],
        })
        .expect(200);

      expect(repriced.body.items[0].monthlyBillingStrategy).toBe("FIXED_30_DAYS");
      expect(repriced.body.subtotalMinor).toBe(20000 * 2 + 1000 * 4);
    });
  });

  // 4. Validation: end date before start date
  it("rejects an end date before the start date", async () => {
    await createRental({ plannedStart: dateOffset(5), plannedEnd: dateOffset(1) }).expect(400);
  });

  // 5. Validation: end date equal to start date
  it("rejects an end date equal to the start date", async () => {
    const same = dateOffset(2);
    await createRental({ plannedStart: same, plannedEnd: same }).expect(400);
  });

  // 6. Validation: negative price
  it("rejects a negative daily price", async () => {
    await createRental({
      items: [{ assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: -100 }],
    }).expect(400);
  });

  // 7. Validation: negative deposit
  it("rejects a negative deposit", async () => {
    await createRental({
      items: [
        { assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000, depositMinor: -50 },
      ],
    }).expect(400);
  });

  // 8. Validation: duplicate assets
  it("rejects duplicate assets within one rental", async () => {
    await createRental({
      items: [
        { assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 },
        { assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 },
      ],
    }).expect(400);
  });

  // 9. Validation: missing customer
  it("rejects a rental with no customerId", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({ plannedStart: dateOffset(1), plannedEnd: dateOffset(4) })
      .expect(400);
  });

  // 10. Validation: missing dates
  it("rejects a rental with no plannedStart/plannedEnd", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({ customerId })
      .expect(400);
  });

  // 11. Renting inactive assets rejected
  it("rejects renting an inactive asset", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .send({ isActive: false })
      .expect(200);

    await createRental().expect(400);
  });

  // 12. Renting non-rentable assets rejected
  it("rejects renting a non-rentable asset", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .send({ isRentable: false })
      .expect(200);

    await createRental().expect(400);
  });

  // 13. Renting deleted assets rejected
  it("rejects renting a soft-deleted asset", async () => {
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .expect(204);

    await createRental().expect(404);
  });

  // 14. Cross-tenant asset rejected
  it("rejects an asset belonging to another tenant", async () => {
    const other = await registerSecondTenant();
    await createRental({
      items: [{ assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
    });

    await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/rentals`)
      .set("Cookie", other.cookie)
      .send({ customerId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4), items: [] })
      .expect(404); // customer belongs to the first tenant, not `other`
  });

  // 15. Cross-tenant customer rejected
  it("rejects a customer belonging to another tenant", async () => {
    const other = await registerSecondTenant();
    const otherCategory = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/asset-categories`)
      .set("Cookie", other.cookie)
      .send({ name: "Tools" })
      .expect(201);
    const otherAsset = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets`)
      .set("Cookie", other.cookie)
      .send({ name: "Drill", internalNumber: "TOOL-1", categoryId: otherCategory.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/rentals`)
      .set("Cookie", other.cookie)
      .send({
        customerId, // belongs to the first tenant
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId: otherAsset.body.id, billingMode: "DAILY", dailyPriceMinor: 500 }],
      })
      .expect(404);
  });

  // 16. Cross-tenant rental access rejected
  it("rejects cross-tenant rental access", async () => {
    const created = await createRental().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  // 17. Reserve transitions DRAFT -> RESERVED and creates history
  it("reserve transitions DRAFT to RESERVED and records status history", async () => {
    const created = await createRental().expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(response.body.status).toBe("RESERVED");

    const history = await prisma.rentalStatusHistory.findMany({
      where: { tenantId, rentalId: created.body.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "DRAFT", toStatus: "RESERVED" });
  });

  // 18. Reserve rejects a rental with no items
  it("rejects reserving a rental with no items", async () => {
    const created = await createRental({ items: [] }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(400);
  });

  // 19. Overlapping reservation test — prevent double booking
  it("prevents double-booking: a second overlapping reservation for the same asset is rejected", async () => {
    const first = await createRental({
      plannedStart: dateOffset(1),
      plannedEnd: dateOffset(5),
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${first.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const second = await createRental({
      plannedStart: dateOffset(3),
      plannedEnd: dateOffset(7),
    }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${second.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  // 20. Back-to-back (non-overlapping) reservations are allowed
  it("allows a back-to-back reservation that starts exactly when the previous one ends", async () => {
    const first = await createRental({
      plannedStart: dateOffset(1),
      plannedEnd: dateOffset(5),
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${first.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const second = await createRental({
      plannedStart: dateOffset(5),
      plannedEnd: dateOffset(8),
    }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${second.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
  });

  // 21. Availability endpoint reports conflicts
  it("GET /rentals/availability reports the conflicting rental", async () => {
    const first = await createRental({
      plannedStart: dateOffset(1),
      plannedEnd: dateOffset(5),
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${first.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .query({
        assetIds: `${assetAId},${assetBId}`,
        plannedStart: dateOffset(3),
        plannedEnd: dateOffset(6),
      })
      .set("Cookie", accessCookie)
      .expect(200);

    const byAsset = Object.fromEntries(
      response.body.results.map((r: { assetId: string; isAvailable: boolean }) => [
        r.assetId,
        r.isAvailable,
      ]),
    );
    expect(byAsset[assetAId]).toBe(false);
    expect(byAsset[assetBId]).toBe(true);
  });

  // 22. Start transitions RESERVED -> ACTIVE, sets actualStart, syncs asset status to RENTED
  it("start transitions RESERVED to ACTIVE and marks the asset RENTED", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(response.body.status).toBe("ACTIVE");
    expect(response.body.actualStart).not.toBeNull();

    const asset = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(asset.body.currentStatus.code).toBe("RENTED");
  });

  // 23. Return (full) transitions ACTIVE -> RETURNED, sets actualEnd, syncs asset status to AVAILABLE
  it("a full return transitions ACTIVE to RETURNED and marks the asset AVAILABLE again", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/return`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(response.body.status).toBe("RETURNED");
    expect(response.body.actualEnd).not.toBeNull();
    expect(response.body.items[0].returnedAt).not.toBeNull();

    const asset = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(asset.body.currentStatus.code).toBe("AVAILABLE");
  });

  // 24. Partial return: rental stays ACTIVE, only the specified items/assets are released
  it("a partial return keeps the rental ACTIVE and only releases the returned asset", async () => {
    const created = await createRental({
      items: [
        { assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 },
        { assetId: assetBId, billingMode: "DAILY", dailyPriceMinor: 1000 },
      ],
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const itemAId = created.body.items.find(
      (item: { assetId: string; id: string }) => item.assetId === assetAId,
    ).id;

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/return`)
      .set("Cookie", accessCookie)
      .send({ itemIds: [itemAId] })
      .expect(201);

    expect(response.body.status).toBe("ACTIVE"); // still active — asset B not returned yet

    const assetA = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${assetAId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const assetB = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${assetBId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(assetA.body.currentStatus.code).toBe("AVAILABLE");
    expect(assetB.body.currentStatus.code).toBe("RENTED");

    // and the freed asset is available again for a new reservation over the remaining window
    const availability = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .query({ assetIds: assetAId, plannedStart: dateOffset(2), plannedEnd: dateOffset(3) })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(availability.body.results[0].isAvailable).toBe(true);
  });

  // 25. Cancel from RESERVED releases the asset, from DRAFT is a no-op release
  it("cancel from RESERVED releases the asset back to AVAILABLE", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({ reason: "Customer changed plans" })
      .expect(201);

    expect(response.body.status).toBe("CANCELLED");

    const availability = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .query({ assetIds: assetAId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4) })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(availability.body.results[0].isAvailable).toBe(true);
  });

  // 26. Cancel rejected from a terminal state
  it("rejects cancelling an already-completed workflow terminal state (RETURNED)", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/return`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  // 27. Delete allowed only for DRAFT/QUOTE/CANCELLED
  it("allows deleting a DRAFT rental but rejects deleting a RESERVED one", async () => {
    const draft = await createRental().expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/rentals/${draft.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const reserved = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${reserved.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/rentals/${reserved.body.id}`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  // 28. Items/dates become immutable once RESERVED
  it("rejects editing items or dates once a rental is RESERVED", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rentals/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ items: [{ assetId: assetBId, billingMode: "DAILY", dailyPriceMinor: 500 }] })
      .expect(409);
  });

  // 29. Permission checks
  it("blocks a VIEWER-role member from creating or reserving, but allows viewing", async () => {
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
      .get(`/tenants/${tenantId}/rentals`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", viewerCookie)
      .send({ customerId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4), items: [] })
      .expect(403);
  });

  it("TECHNICIAN can start/return but not create/reserve/cancel", async () => {
    const techRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "tech@example.com", companyName: "Tech Co" })
      .expect(201);
    const techBody = techRegister.body as RegisterResponseBody;
    const techCookie = extractCookie(techRegister.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: techBody.user.id, role: "TECHNICIAN", status: "ACTIVE" },
    });

    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", techCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", techCookie)
      .send({ customerId, plannedStart: dateOffset(1), plannedEnd: dateOffset(4), items: [] })
      .expect(403);
  });

  // 30. Workflow test: full lifecycle audit trail
  it("logs an audit entry for every lifecycle step", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/return`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const actions = await prisma.auditLog.findMany({
      where: { entityType: "Rental", entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "rental.created",
      "rental.status_changed", // reserve
      "rental.status_changed", // start
      "rental.returned",
    ]);
  });

  // 31. Timeline
  it("returns a chronological timeline combining creation and status changes", async () => {
    const created = await createRental().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const timeline = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${created.body.id}/timeline`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(timeline.body[0].type).toBe("created");
    expect(timeline.body.some((event: { type: string }) => event.type === "status_changed")).toBe(
      true,
    );
  });

  // 32b. Rental detail surfaces linked documents and a null sourceQuote for a directly-created rental (Chapter 7)
  it("GET /rentals/:id includes sourceQuote (null) and any linked, non-deleted documents", async () => {
    const created = await createRental().expect(201);

    const noDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(noDocuments.body.sourceQuote).toBeNull();
    expect(noDocuments.body.documents).toEqual([]);

    const document = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, rentalId: created.body.id })
      .expect(201);

    const deletedDocument = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, rentalId: created.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${deletedDocument.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const withDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(withDocuments.body.documents).toHaveLength(1);
    expect(withDocuments.body.documents[0]).toMatchObject({
      id: document.body.id,
      documentType: "CONTRACT",
    });
  });

  // 32. Pagination and filtering
  it("paginates and filters the rental list by status", async () => {
    for (let i = 0; i < 3; i += 1) {
      await createRental({
        plannedStart: dateOffset(10 + i),
        plannedEnd: dateOffset(12 + i),
      }).expect(201);
    }
    const reserved = await createRental({
      plannedStart: dateOffset(20),
      plannedEnd: dateOffset(22),
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${reserved.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const page1 = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals`)
      .query({ page: 1, pageSize: 2 })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(4);

    const filtered = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals`)
      .query({ status: "RESERVED" })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].id).toBe(reserved.body.id);
  });
});
