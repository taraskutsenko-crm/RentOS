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

describe("Quotes E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
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
    categoryId = categoryResponse.body.id;

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

  function createQuote(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
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
            assetId: assetAId,
            name: "Generator A",
            billingMode: "DAILY",
            dailyPriceMinor: 1000,
          },
        ],
        ...overrides,
      });
  }

  async function createAndSendQuote(overrides: Record<string, unknown> = {}) {
    const created = await createQuote(overrides).expect(201);
    const sent = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    return { quoteId: created.body.id as string, sendResponse: sent.body };
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

  // ---------------------------------------------------------------------
  // CRUD + pricing
  // ---------------------------------------------------------------------

  it("creates a DRAFT quote with a Q-<year>-###### number and computed DAILY totals", async () => {
    const response = await createQuote().expect(201);

    expect(response.body).toMatchObject({
      tenantId,
      customerId,
      status: "DRAFT",
      subtotalMinor: 3000, // 3 days * 1000
      totalMinor: 3000,
    });
    expect(response.body.quoteNumber).toMatch(/^Q-\d{4}-\d{6}$/);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.publicTokenHash).toBeUndefined();
  });

  it("computes calendar-accurate MONTHLY pricing (Jan 31 -> Feb 28)", async () => {
    const response = await createQuote({
      plannedStart: "2027-01-31T00:00:00.000Z",
      plannedEnd: "2027-02-28T00:00:00.000Z",
      validUntil: "2027-03-01T00:00:00.000Z",
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "MONTHLY",
          monthlyPriceMinor: 15000,
          dailyPriceMinor: 500,
        },
      ],
    }).expect(201);

    expect(response.body.subtotalMinor).toBe(15000);
    expect(response.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");
  });

  // ---------------------------------------------------------------------
  // Configurable monthly billing strategies — shared with Rentals (ADR 0008)
  // ---------------------------------------------------------------------

  describe("MONTHLY billing strategy consistency with Rentals", () => {
    function isoDaysAfter(base: string, days: number): string {
      const date = new Date(base);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString();
    }

    async function setTenantStrategy(
      strategy: string,
      customMonthLengthDays?: number,
    ): Promise<void> {
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({
          monthlyBillingStrategy: strategy,
          partialMonthPolicy: "PRORATE_BY_DAY",
          ...(customMonthLengthDays !== undefined ? { customMonthLengthDays } : {}),
        })
        .expect(200);
    }

    it("defaults to CALENDAR_MONTH and splits complete months plus remaining days (Jan 15 -> Mar 20)", async () => {
      const response = await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(20000 * 2 + 1000 * 5);
      expect(response.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");
    });

    it("rejects a MONTHLY quote item missing dailyPriceMinor", async () => {
      await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
          },
        ],
      }).expect(400);
    });

    it("ROUND_UP_TO_FULL_MONTH never requires dailyPriceMinor and rounds any started remainder up to a full month", async () => {
      const response = await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
          },
        ],
      }).expect(201);

      // 2 complete months + a started remainder -> rounds up to 3 full months.
      expect(response.body.subtotalMinor).toBe(20000 * 3);
      expect(response.body.items[0].partialMonthPolicy).toBe("ROUND_UP_TO_FULL_MONTH");
    });

    it("uses FIXED_30_DAYS once configured on tenant settings", async () => {
      await setTenantStrategy("FIXED_30_DAYS");

      const start = "2030-01-01T00:00:00.000Z";
      const response = await createQuote({
        plannedStart: start,
        plannedEnd: isoDaysAfter(start, 65),
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 30000,
            dailyPriceMinor: 900,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(30000 * 2 + 900 * 5);
      expect(response.body.items[0].monthlyBillingStrategy).toBe("FIXED_30_DAYS");
    });

    it("uses CUSTOM with customMonthLengthDays once configured on tenant settings", async () => {
      await setTenantStrategy("CUSTOM", 28);

      const start = "2030-01-01T00:00:00.000Z";
      const response = await createQuote({
        plannedStart: start,
        plannedEnd: isoDaysAfter(start, 60),
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 28000,
            dailyPriceMinor: 800,
          },
        ],
      }).expect(201);

      expect(response.body.subtotalMinor).toBe(28000 * 2 + 800 * 4);
      expect(response.body.items[0].monthlyBillingStrategy).toBe("CUSTOM");
      expect(response.body.items[0].customMonthLengthDays).toBe(28);
    });

    it("snapshots the strategy at creation time — a later tenant settings change never alters the stored total", async () => {
      const created = await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);
      const originalTotal = created.body.totalMinor as number;
      expect(originalTotal).toBe(20000 * 2 + 1000 * 5);

      await setTenantStrategy("FIXED_30_DAYS");

      const refetched = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(refetched.body.totalMinor).toBe(originalTotal);
      expect(refetched.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");

      // An unrelated edit that doesn't touch items must also keep the frozen strategy.
      const updated = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/quotes/${created.body.id}`)
        .set("Cookie", accessCookie)
        .send({ internalNotes: "updated notes" })
        .expect(200);
      expect(updated.body.totalMinor).toBe(originalTotal);
      expect(updated.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");
    });

    it("an explicit item replacement picks up the tenant's current settings (intentional reprice)", async () => {
      const created = await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);

      await setTenantStrategy("FIXED_30_DAYS");

      // Jan 15 -> Mar 20 is 64 days -> under FIXED_30_DAYS: 2 x 30-day units + 4 remaining.
      const repriced = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/quotes/${created.body.id}`)
        .set("Cookie", accessCookie)
        .send({
          items: [
            {
              itemType: "ASSET",
              assetId: assetAId,
              name: "Generator A",
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

    it("duplication carries over the exact frozen strategy, never re-reading current tenant settings", async () => {
      const created = await createQuote({
        plannedStart: "2030-01-15T00:00:00.000Z",
        plannedEnd: "2030-03-20T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 20000,
            dailyPriceMinor: 1000,
          },
        ],
      }).expect(201);
      expect(created.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");

      await setTenantStrategy("FIXED_30_DAYS");

      const duplicate = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${created.body.id}/duplicate`)
        .set("Cookie", accessCookie)
        .expect(201);

      expect(duplicate.body.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");
      expect(duplicate.body.totalMinor).toBe(created.body.totalMinor);
    });

    it("quote-to-rental conversion carries the frozen strategy onto the RentalItem, while the Rental's total matches the accepted quote verbatim", async () => {
      const quoteId = (
        await createAndSendQuote({
          plannedStart: "2030-01-15T00:00:00.000Z",
          plannedEnd: "2030-03-20T00:00:00.000Z",
          items: [
            {
              itemType: "ASSET",
              assetId: assetAId,
              name: "Generator A",
              billingMode: "MONTHLY",
              monthlyPriceMinor: 20000,
              dailyPriceMinor: 1000,
            },
          ],
        })
      ).quoteId;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
        .set("Cookie", accessCookie)
        .send({ acceptedBy: "Jane" })
        .expect(201);

      const quote = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/quotes/${quoteId}`)
        .set("Cookie", accessCookie)
        .expect(200);

      // Change tenant settings between acceptance and conversion — must not
      // affect the resulting rental.
      await setTenantStrategy("FIXED_30_DAYS");

      const converted = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      expect(converted.body.rental.totalMinor).toBe(quote.body.totalMinor);
      expect(converted.body.rental.items[0].monthlyBillingStrategy).toBe("CALENDAR_MONTH");

      // The converted Rental surfaces its source Quote (Chapter 7).
      const rental = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${converted.body.rental.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(rental.body.sourceQuote).toMatchObject({
        id: quoteId,
        quoteNumber: quote.body.quoteNumber,
      });
    });

    it("quote-to-rental conversion preserves a ROUND_UP_TO_FULL_MONTH item's frozen policy and total verbatim", async () => {
      const quoteId = (
        await createAndSendQuote({
          plannedStart: "2030-08-18T00:00:00.000Z",
          plannedEnd: "2030-09-19T00:00:00.000Z", // 1 month + 1 day
          items: [
            {
              itemType: "ASSET",
              assetId: assetAId,
              name: "Generator A",
              billingMode: "MONTHLY",
              monthlyPriceMinor: 60000,
              partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
            },
          ],
        })
      ).quoteId;
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
        .set("Cookie", accessCookie)
        .send({ acceptedBy: "Jane" })
        .expect(201);

      const quote = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/quotes/${quoteId}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(quote.body.totalMinor).toBe(60000 * 2); // rounded up to 2 full months

      const converted = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      expect(converted.body.rental.totalMinor).toBe(quote.body.totalMinor);
      expect(converted.body.rental.items[0].partialMonthPolicy).toBe("ROUND_UP_TO_FULL_MONTH");
    });

    it("a legacy MONTHLY item with no stored strategy (pre-dating this feature) is still readable and reproduces its original whole-month-rounding total on an unrelated edit", async () => {
      // Jan 31 -> Feb 28: under the OLD whole-month-rounding rule this is
      // exactly 1 month with 0 remainder, same total either engine would
      // produce for this particular boundary-exact span — the real
      // assertion here is that a null-strategy item never throws and never
      // requires a dailyPriceMinor it was never priced with.
      const created = await createQuote({
        plannedStart: "2027-01-31T00:00:00.000Z",
        plannedEnd: "2027-02-28T00:00:00.000Z",
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "MONTHLY",
            monthlyPriceMinor: 15000,
            dailyPriceMinor: 500,
          },
        ],
      }).expect(201);

      // Simulate a row written before this feature existed: no snapshot fields.
      await prisma.quoteItem.updateMany({
        where: { quoteId: created.body.id },
        data: { monthlyBillingStrategy: null, customMonthLengthDays: null, dailyPriceMinor: null },
      });

      const updated = await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/quotes/${created.body.id}`)
        .set("Cookie", accessCookie)
        .send({ internalNotes: "legacy row edit" })
        .expect(200);

      expect(updated.body.items[0].monthlyBillingStrategy).toBeNull();
      expect(updated.body.subtotalMinor).toBe(15000);
      expect(updated.body.totalMinor).toBe(15000);
    });
  });

  it("computes FLAT pricing for a non-asset item (quantity * unitPrice, no duration factor)", async () => {
    const response = await createQuote({
      items: [
        {
          itemType: "DELIVERY",
          name: "Delivery",
          billingMode: "FLAT",
          unitPriceMinor: 5000,
          quantity: 1,
        },
      ],
    }).expect(201);

    expect(response.body.subtotalMinor).toBe(5000);
  });

  it("a Delivery line item is fully included in the commercial total alongside a MONTHLY rental item, and survives Quote -> Rental conversion (manual-testing bug fix)", async () => {
    // Real example from manual testing: Rental = 600 PLN/month, Delivery = 700 x 2.
    const created = await createQuote({
      plannedStart: "2030-08-18T00:00:00.000Z",
      plannedEnd: "2030-09-18T00:00:00.000Z", // exactly 1 calendar month
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "MONTHLY",
          monthlyPriceMinor: 60000,
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        },
        {
          itemType: "DELIVERY",
          name: "Delivery",
          billingMode: "FLAT",
          unitPriceMinor: 70000,
          quantity: 2,
        },
      ],
    }).expect(201);

    expect(created.body.items).toHaveLength(2);
    const deliveryItem = created.body.items.find(
      (item: { itemType: string }) => item.itemType === "DELIVERY",
    );
    expect(deliveryItem.lineTotalMinor).toBe(70000 * 2);
    expect(created.body.subtotalMinor).toBe(60000 + 70000 * 2);
    expect(created.body.totalMinor).toBe(60000 + 70000 * 2);

    // Persisted Quote and Quote detail both reflect the same total.
    const refetched = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(refetched.body.totalMinor).toBe(60000 + 70000 * 2);

    // Rental after conversion preserves the same commercial total, with the
    // Delivery item still present and correctly valued.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/accept`)
      .set("Cookie", accessCookie)
      .send({ acceptedBy: "Jane" })
      .expect(201);
    const converted = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(converted.body.rental.totalMinor).toBe(60000 + 70000 * 2);
  });

  it("applies per-line percentage discount, per-line tax, quote-level fixed discount, and sums deposits", async () => {
    const response = await createQuote({
      discountType: "FIXED",
      discountValue: 500,
      items: [
        {
          itemType: "SERVICE",
          name: "Setup service",
          billingMode: "FLAT",
          unitPriceMinor: 10000,
          discountType: "PERCENTAGE",
          discountValue: 1000, // 10%
          taxRateBp: 2000, // 20%
          depositMinor: 2000,
        },
      ],
    }).expect(201);

    // line: 10000 - 10% = 9000, +20% tax = 10800
    expect(response.body.items[0].lineTotalMinor).toBe(10800);
    expect(response.body.subtotalMinor).toBe(10800);
    expect(response.body.discountTotalMinor).toBe(500); // quote-level FIXED discount
    expect(response.body.depositTotalMinor).toBe(2000);
    expect(response.body.totalMinor).toBe(10800 - 500);
  });

  it("rejects validUntil before issueDate", async () => {
    await createQuote({ issueDate: dateOffset(10), validUntil: dateOffset(1) }).expect(400);
  });

  it("rejects plannedEnd before plannedStart", async () => {
    await createQuote({ plannedStart: dateOffset(5), plannedEnd: dateOffset(1) }).expect(400);
  });

  it("rejects a zero or negative quantity", async () => {
    await createQuote({
      items: [
        { itemType: "FEE", name: "Fee", billingMode: "FLAT", unitPriceMinor: 100, quantity: 0 },
      ],
    }).expect(400);
  });

  it("rejects an ASSET item without an assetId", async () => {
    await createQuote({
      items: [
        { itemType: "ASSET", name: "Generator A", billingMode: "DAILY", dailyPriceMinor: 1000 },
      ],
    }).expect(400);
  });

  it("rejects a non-ASSET item that sets an assetId", async () => {
    await createQuote({
      items: [
        {
          itemType: "SERVICE",
          assetId: assetAId,
          name: "Service",
          billingMode: "FLAT",
          unitPriceMinor: 100,
        },
      ],
    }).expect(400);
  });

  it("rejects an ASSET item using FLAT billing mode", async () => {
    await createQuote({
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "FLAT",
          unitPriceMinor: 100,
        },
      ],
    }).expect(400);
  });

  it("rejects duplicate asset lines within the same quote", async () => {
    await createQuote({
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "DAILY",
          dailyPriceMinor: 1000,
        },
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "DAILY",
          dailyPriceMinor: 1000,
        },
      ],
    }).expect(400);
  });

  it("rejects a customer belonging to another tenant", async () => {
    const other = await registerSecondTenant();
    const otherCustomer = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/customers`)
      .set("Cookie", other.cookie)
      .send({ firstName: "Other", lastName: "Customer" })
      .expect(201);

    await createQuote({ customerId: otherCustomer.body.id }).expect(404);
  });

  it("rejects an asset belonging to another tenant", async () => {
    const other = await registerSecondTenant();
    const otherCategory = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/asset-categories`)
      .set("Cookie", other.cookie)
      .send({ name: "Vehicles" })
      .expect(201);
    const otherAsset = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets`)
      .set("Cookie", other.cookie)
      .send({ name: "Truck", internalNumber: "T-1", categoryId: otherCategory.body.id })
      .expect(201);

    await createQuote({
      items: [
        {
          itemType: "ASSET",
          assetId: otherAsset.body.id,
          name: "Truck",
          billingMode: "DAILY",
          dailyPriceMinor: 1000,
        },
      ],
    }).expect(404);
  });

  it("rejects cross-tenant quote access", async () => {
    const created = await createQuote().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  it("lists quotes with pagination, status filter, and search", async () => {
    await createQuote();
    await createQuote({
      items: [
        { itemType: "SERVICE", name: "Different service", billingMode: "FLAT", unitPriceMinor: 1 },
      ],
    });

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .query({ page: 1, pageSize: 10, status: "DRAFT" })
      .expect(200);

    expect(list.body.total).toBe(2);
    expect(list.body.items).toHaveLength(2);

    const searched = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .query({ search: list.body.items[0].quoteNumber })
      .expect(200);
    expect(searched.body.total).toBe(1);
  });

  it("updates a DRAFT quote's items and recomputes totals", async () => {
    const created = await createQuote().expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "DAILY",
            dailyPriceMinor: 2000,
          },
        ],
      })
      .expect(200);

    expect(updated.body.subtotalMinor).toBe(6000); // 3 days * 2000
  });

  it("rejects editing commercial fields once a quote is no longer DRAFT", async () => {
    const { quoteId } = await createAndSendQuote();

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .send({ plannedStart: dateOffset(2) })
      .expect(409);
  });

  it("allows editing internalNotes on a SENT quote", async () => {
    const { quoteId } = await createAndSendQuote();

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .send({ internalNotes: "Called customer to follow up" })
      .expect(200);
  });

  it("deletes a DRAFT quote but rejects deleting a SENT quote", async () => {
    const draft = await createQuote().expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/quotes/${draft.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const { quoteId } = await createAndSendQuote();
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------

  it("blocks a VIEWER-role member from creating a quote but allows viewing and downloading", async () => {
    const viewerRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "viewer@example.com", companyName: "Viewer Co" })
      .expect(201);
    const viewerBody = viewerRegister.body as RegisterResponseBody;
    const viewerCookie = extractCookie(viewerRegister.headers, "rentos_access_token");

    await prisma.tenantMembership.create({
      data: { tenantId, userId: viewerBody.user.id, role: "VIEWER", status: "ACTIVE" },
    });

    const created = await createQuote().expect(201);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", viewerCookie)
      .send({
        customerId,
        validUntil: dateOffset(30),
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", viewerCookie)
      .send({})
      .expect(403);
  });

  it("blocks a TECHNICIAN-role member from any quote permission", async () => {
    const techRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "tech@example.com", companyName: "Tech Co" })
      .expect(201);
    const techBody = techRegister.body as RegisterResponseBody;
    const techCookie = extractCookie(techRegister.headers, "rentos_access_token");

    await prisma.tenantMembership.create({
      data: { tenantId, userId: techBody.user.id, role: "TECHNICIAN", status: "ACTIVE" },
    });

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes`)
      .set("Cookie", techCookie)
      .expect(403);
  });

  // ---------------------------------------------------------------------
  // Send, history, PDF
  // ---------------------------------------------------------------------

  // Quote.status flips to SENT regardless of email outcome (the offer is
  // now dispatched/active for the customer's public link — a broader
  // business state than raw email delivery, same separation Document/
  // Invoice keep). The email itself is honestly reported as NOT sent here
  // because no real EmailProvider is configured in tests (LoggingEmailProvider
  // — see EmailProvider.isConfigured() / DECISIONS.md truthfulness fix);
  // it is never fabricated as sent just because a provider was invoked.
  it("sends a quote, transitioning DRAFT -> SENT, and honestly reports the email as not sent (no provider configured)", async () => {
    const created = await createQuote().expect(201);

    const sendResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(sendResponse.body.emailSent).toBe(false);
    expect(sendResponse.body.emailError).toBe("No email provider is configured");
    expect(sendResponse.body.quote.status).toBe("SENT");

    const deliveries = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}/email-deliveries`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(deliveries.body).toHaveLength(1);
    expect(deliveries.body[0]).toMatchObject({ status: "NOT_CONFIGURED" });
  });

  it("rejects sending a quote with no items", async () => {
    const created = await createQuote({ items: [] }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(400);
  });

  it("generates a PDF on first GET and serves the same document on a second GET", async () => {
    const created = await createQuote().expect(201);

    const first = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(first.headers["content-type"]).toContain("application/pdf");
    expect(first.body.subarray(0, 4).toString("ascii")).toBe("%PDF");

    const docsAfterFirst = await prisma.quoteDocument.findMany({
      where: { quoteId: created.body.id },
    });
    expect(docsAfterFirst).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);

    const docsAfterSecond = await prisma.quoteDocument.findMany({
      where: { quoteId: created.body.id },
    });
    expect(docsAfterSecond).toHaveLength(1); // GET never regenerates
  });

  it("regenerates a new PDF document on POST", async () => {
    const created = await createQuote().expect(201);
    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/pdf`)
      .set("Cookie", accessCookie)
      .expect(201);

    const docs = await prisma.quoteDocument.findMany({ where: { quoteId: created.body.id } });
    expect(docs).toHaveLength(2);
  });

  it("records a chronological history including creation and status changes", async () => {
    const { quoteId } = await createAndSendQuote();

    const history = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}/history`)
      .set("Cookie", accessCookie)
      .expect(200);

    const types = history.body.map((event: { type: string }) => event.type);
    expect(types).toContain("created");
    expect(types).toContain("sent");
    expect(types).toContain("status_changed");
  });

  // 32b. Quote detail surfaces linked generic Documents (Chapter 8)
  it("GET /quotes/:id includes platformDocuments reflecting real Document.quoteId links", async () => {
    const created = await createQuote().expect(201);

    const noDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(noDocuments.body.platformDocuments).toEqual([]);

    const document = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, quoteId: created.body.id })
      .expect(201);

    const deletedDocument = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", accessCookie)
      .send({ documentType: "CONTRACT", customerId, quoteId: created.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/documents/${deletedDocument.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const withDocuments = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(withDocuments.body.platformDocuments).toHaveLength(1);
    expect(withDocuments.body.platformDocuments[0]).toMatchObject({
      id: document.body.id,
      documentType: "CONTRACT",
    });
  });

  // ---------------------------------------------------------------------
  // Public token workflow (view / accept / reject)
  // ---------------------------------------------------------------------

  async function sendAndGetToken(overrides: Record<string, unknown> = {}): Promise<{
    quoteId: string;
    token: string;
  }> {
    const created = await createQuote(overrides).expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    // The plaintext token is only ever transmitted via the (logged) email
    // body, never persisted — for test purposes we mint our own token and
    // overwrite the stored hash directly, exactly mirroring what `send()`
    // itself does, so the public-endpoint tests exercise real hash lookup.
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(48).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.quote.update({
      where: { id: created.body.id },
      data: { publicTokenHash: tokenHash },
    });

    return { quoteId: created.body.id as string, token };
  }

  it("returns 404 for an unknown or malformed public token", async () => {
    await request(app.getHttpServer()).get("/public/quotes/not-a-real-token").expect(404);
  });

  it("views a quote via its public token, transitioning SENT -> VIEWED on first view only", async () => {
    const { quoteId, token } = await sendAndGetToken();

    const firstView = await request(app.getHttpServer()).get(`/public/quotes/${token}`).expect(200);
    expect(firstView.body.status).toBe("VIEWED");
    expect(firstView.body.quoteNumber).toBeDefined();
    // Public view must never expose internal-only fields.
    expect(firstView.body.internalNotes).toBeUndefined();
    expect(firstView.body.tenantId).toBeUndefined();
    expect(firstView.body.publicTokenHash).toBeUndefined();

    const history = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}/history`)
      .set("Cookie", accessCookie)
      .expect(200);
    const viewedEvents = history.body.filter((event: { type: string }) => event.type === "viewed");
    expect(viewedEvents).toHaveLength(1);

    // Second view must not re-log another "viewed" transition.
    await request(app.getHttpServer()).get(`/public/quotes/${token}`).expect(200);
    const historyAfterSecondView = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}/history`)
      .set("Cookie", accessCookie)
      .expect(200);
    const viewedEventsAfter = historyAfterSecondView.body.filter(
      (event: { type: string }) => event.type === "viewed",
    );
    expect(viewedEventsAfter).toHaveLength(1);
  });

  it("accepts a quote via its public token, and a repeated accept is idempotent", async () => {
    const { quoteId, token } = await sendAndGetToken();

    const accept = await request(app.getHttpServer())
      .post(`/public/quotes/${token}/accept`)
      .send({ acceptedBy: "Jane Doe" })
      .expect(201);
    expect(accept.body.status).toBe("ACCEPTED");

    const repeated = await request(app.getHttpServer())
      .post(`/public/quotes/${token}/accept`)
      .send({ acceptedBy: "Jane Doe" })
      .expect(201);
    expect(repeated.body.status).toBe("ACCEPTED");

    const statusHistory = await prisma.quoteStatusHistory.findMany({
      where: { quoteId, toStatus: "ACCEPTED" },
    });
    expect(statusHistory).toHaveLength(1); // idempotent — no duplicate history row
  });

  it("rejects a quote via its public token with a reason, idempotently", async () => {
    const { quoteId, token } = await sendAndGetToken();

    const reject = await request(app.getHttpServer())
      .post(`/public/quotes/${token}/reject`)
      .send({ reason: "Too expensive" })
      .expect(201);
    expect(reject.body.status).toBe("REJECTED");
    expect(reject.body.rejectionReason).toBe("Too expensive");

    await request(app.getHttpServer()).post(`/public/quotes/${token}/reject`).send({}).expect(201);

    const statusHistory = await prisma.quoteStatusHistory.findMany({
      where: { quoteId, toStatus: "REJECTED" },
    });
    expect(statusHistory).toHaveLength(1);
  });

  it("rejects accepting an already-REJECTED quote", async () => {
    const { token } = await sendAndGetToken();
    await request(app.getHttpServer()).post(`/public/quotes/${token}/reject`).send({}).expect(201);
    await request(app.getHttpServer()).post(`/public/quotes/${token}/accept`).send({}).expect(409);
  });

  it("downloads the PDF via the public token", async () => {
    const { token } = await sendAndGetToken();
    const response = await request(app.getHttpServer())
      .get(`/public/quotes/${token}/pdf`)
      .expect(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
  });

  it("allows staff to record acceptance and rejection directly", async () => {
    const { quoteId } = await createAndSendQuote();

    const accept = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
      .set("Cookie", accessCookie)
      .send({ acceptedBy: "Staff on behalf of customer" })
      .expect(201);
    expect(accept.body.status).toBe("ACCEPTED");
  });

  it("cancels a DRAFT or SENT quote idempotently, but rejects cancelling an ACCEPTED quote", async () => {
    const { quoteId } = await createAndSendQuote();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201); // idempotent no-op

    const { quoteId: acceptedQuoteId } = await createAndSendQuote();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${acceptedQuoteId}/accept`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${acceptedQuoteId}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Duplication
  // ---------------------------------------------------------------------

  it("duplicates a quote into a fresh DRAFT with a new number and cleared acceptance metadata", async () => {
    const { quoteId } = await createAndSendQuote();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
      .set("Cookie", accessCookie)
      .send({ acceptedBy: "Jane" })
      .expect(201);

    const duplicate = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/duplicate`)
      .set("Cookie", accessCookie)
      .expect(201);

    expect(duplicate.body.status).toBe("DRAFT");
    expect(duplicate.body.acceptedAt).toBeNull();
    expect(duplicate.body.acceptedBy).toBeNull();
    expect(duplicate.body.duplicatedFromQuoteId).toBe(quoteId);
    expect(duplicate.body.items).toHaveLength(1);

    const original = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(duplicate.body.quoteNumber).not.toBe(original.body.quoteNumber);
  });

  // ---------------------------------------------------------------------
  // Expiration
  // ---------------------------------------------------------------------

  it("lazily transitions an overdue SENT quote to EXPIRED on next access, blocking acceptance", async () => {
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        issueDate: "2020-01-01T00:00:00.000Z",
        validUntil: "2020-01-10T00:00:00.000Z", // long past
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [
          {
            itemType: "ASSET",
            assetId: assetAId,
            name: "Generator A",
            billingMode: "DAILY",
            dailyPriceMinor: 1000,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/send`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const fetched = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(fetched.body.status).toBe("EXPIRED");

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${created.body.id}/accept`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Quote -> Rental conversion
  // ---------------------------------------------------------------------

  async function createAcceptedQuote(overrides: Record<string, unknown> = {}) {
    const { quoteId } = await createAndSendQuote(overrides);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/accept`)
      .set("Cookie", accessCookie)
      .send({ acceptedBy: "Jane" })
      .expect(201);
    return quoteId;
  }

  it("converts an ACCEPTED quote into a RESERVED rental with matching totals inside one transaction", async () => {
    const quoteId = await createAcceptedQuote({
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "DAILY",
          dailyPriceMinor: 1000,
        },
        { itemType: "DELIVERY", name: "Delivery", billingMode: "FLAT", unitPriceMinor: 500 },
      ],
    });

    const conversion = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(201);

    expect(conversion.body.alreadyConverted).toBe(false);
    expect(conversion.body.rental.status).toBe("RESERVED");
    expect(conversion.body.rental.sourceQuoteId).toBe(quoteId);
    // Only the ASSET item becomes a RentalItem; the DELIVERY line does not.
    expect(conversion.body.rental.items).toHaveLength(1);
    expect(conversion.body.rental.items[0].assetId).toBe(assetAId);

    const quoteAfter = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(quoteAfter.body.status).toBe("CONVERTED");

    // Rental totals match the Quote's full (asset + non-asset) total, not
    // just the sum of the copied RentalItem.
    expect(conversion.body.rental.totalMinor).toBe(quoteAfter.body.totalMinor);
  });

  it("rejects converting a quote that has not been accepted", async () => {
    const { quoteId } = await createAndSendQuote();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  it("is idempotent: converting an already-CONVERTED quote returns the same rental, not a new one", async () => {
    const quoteId = await createAcceptedQuote();

    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(201);

    expect(second.body.alreadyConverted).toBe(true);
    expect(second.body.rental.id).toBe(first.body.rental.id);

    const rentals = await prisma.rental.findMany({ where: { sourceQuoteId: quoteId } });
    expect(rentals).toHaveLength(1); // never a second rental
  });

  it("returns a conflict when the required asset became unavailable before conversion", async () => {
    const quoteId = await createAcceptedQuote();

    // Reserve the same asset over an overlapping window via a normal rental.
    const conflictingRental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId: assetAId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${conflictingRental.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(409);

    // The quote must remain ACCEPTED, not silently converted or corrupted.
    const quoteAfter = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/quotes/${quoteId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(quoteAfter.body.status).toBe("ACCEPTED");
  });

  it("rejects converting a quote with only non-asset items", async () => {
    const quoteId = await createAcceptedQuote({
      items: [
        { itemType: "SERVICE", name: "Consulting", billingMode: "FLAT", unitPriceMinor: 1000 },
      ],
    });

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(400);
  });

  it("converts a quote with multiple asset items into a rental with matching RentalItem rows", async () => {
    const quoteId = await createAcceptedQuote({
      items: [
        {
          itemType: "ASSET",
          assetId: assetAId,
          name: "Generator A",
          billingMode: "DAILY",
          dailyPriceMinor: 1000,
        },
        {
          itemType: "ASSET",
          assetId: assetBId,
          name: "Generator B",
          billingMode: "WEEKLY",
          weeklyPriceMinor: 5000,
        },
      ],
    });

    const conversion = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quoteId}/convert-to-rental`)
      .set("Cookie", accessCookie)
      .expect(201);

    const convertedAssetIds = conversion.body.rental.items
      .map((item: { assetId: string }) => item.assetId)
      .sort();
    expect(convertedAssetIds).toEqual([assetAId, assetBId].sort());
  });
});
