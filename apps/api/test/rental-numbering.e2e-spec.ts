import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateRentalNumber } from "../src/rentals/rental-numbering.util";
import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

/**
 * Real-database coverage for the race-safe RNT-###### generator (see
 * docs/adr/0008-configurable-monthly-billing-strategies.md and
 * docs/DECISIONS.md D-016/D-017). `rental-numbering.util.spec.ts` covers
 * the pure formatting/query-shape logic against a mocked transaction
 * client; every test here exercises the real Postgres implementation —
 * concurrent HTTP requests through the full Nest app, and a real
 * `$transaction` rollback — since a mocked helper can't prove the atomic
 * upsert is actually race-free under contention.
 */
describe("Rental Numbering E2E (race-safe generation)", () => {
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

  // Every rental created here stays DRAFT (never reserved), so reusing the
  // same asset across many concurrent rentals is safe — availability is
  // only enforced at reserve time, not at create time (see ADR 0006).
  function createRental() {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
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

  it("issues RNT-000001 as the first number for a fresh tenant", async () => {
    const response = await createRental().expect(201);
    expect(response.body.rentalNumber).toBe("RNT-000001");
  });

  it("issues sequential numbers for successive rentals", async () => {
    const first = await createRental().expect(201);
    const second = await createRental().expect(201);
    const third = await createRental().expect(201);
    expect(first.body.rentalNumber).toBe("RNT-000001");
    expect(second.body.rentalNumber).toBe("RNT-000002");
    expect(third.body.rentalNumber).toBe("RNT-000003");
  });

  it("keeps separate, independent counters per tenant", async () => {
    await createRental().expect(201);
    await createRental().expect(201);

    const other = await registerSecondTenant();
    const otherCategoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/asset-categories`)
      .set("Cookie", other.cookie)
      .send({ name: "Tools" })
      .expect(201);
    const otherAssetResponse = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets`)
      .set("Cookie", other.cookie)
      .send({
        name: "Drill",
        internalNumber: "TOOL-0001",
        categoryId: otherCategoryResponse.body.id,
      })
      .expect(201);
    const otherCustomerResponse = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/customers`)
      .set("Cookie", other.cookie)
      .send({ firstName: "John", lastName: "Smith" })
      .expect(201);

    // The second tenant's first rental must start at 000001 too — not
    // continue from the first tenant's counter (which is at 2).
    const otherRental = await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/rentals`)
      .set("Cookie", other.cookie)
      .send({
        customerId: otherCustomerResponse.body.id,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [
          { assetId: otherAssetResponse.body.id, billingMode: "DAILY", dailyPriceMinor: 500 },
        ],
      })
      .expect(201);
    expect(otherRental.body.rentalNumber).toBe("RNT-000001");
  });

  it("initializes a tenant's counter from its highest existing standard rental number (migration backfill behavior)", async () => {
    // Simulates what the add_rental_sequence migration's backfill does for
    // a tenant that already had rentals before this feature existed: seed
    // a RentalSequence row directly (bypassing generateRentalNumber) at a
    // value matching a pre-existing historical number, then confirm the
    // next generated number continues from there without colliding.
    await prisma.rentalSequence.create({ data: { tenantId, lastNumber: 41 } });
    const response = await createRental().expect(201);
    expect(response.body.rentalNumber).toBe("RNT-000042");
  });

  it("never issues a duplicate number even under concurrent creation requests", async () => {
    const concurrency = 10;
    const responses = await Promise.all(Array.from({ length: concurrency }, () => createRental()));

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const numbers = responses.map((response) => response.body.rentalNumber as string);
    expect(new Set(numbers).size).toBe(concurrency);
    expect(numbers.sort()).toEqual(
      Array.from({ length: concurrency }, (_, i) => `RNT-${String(i + 1).padStart(6, "0")}`).sort(),
    );
  });

  it("never issues a duplicate number under high-contention concurrent creation (25 simultaneous requests)", async () => {
    const concurrency = 25;
    const responses = await Promise.all(Array.from({ length: concurrency }, () => createRental()));

    const numbers = responses.map((response) => {
      expect(response.status).toBe(201);
      return response.body.rentalNumber as string;
    });
    expect(new Set(numbers).size).toBe(concurrency);

    // The database-level unique constraint is the final safeguard — assert
    // it directly, independent of the application-level counter logic.
    const rentals = await prisma.rental.findMany({ where: { tenantId } });
    expect(new Set(rentals.map((r) => r.rentalNumber)).size).toBe(concurrency);
  });

  it("rolls back the reserved number when the enclosing transaction fails", async () => {
    await prisma.rentalSequence.create({ data: { tenantId, lastNumber: 5 } });

    await expect(
      prisma.$transaction(async (tx) => {
        const number = await generateRentalNumber(tx, tenantId);
        expect(number).toBe("RNT-000006");
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    const sequence = await prisma.rentalSequence.findUnique({ where: { tenantId } });
    expect(sequence?.lastNumber).toBe(5);

    // The next real generation must reuse 000006 — the failed attempt's
    // reservation was never actually committed.
    const response = await createRental().expect(201);
    expect(response.body.rentalNumber).toBe("RNT-000006");
  });

  it("is enforced by a database unique constraint as the final safeguard", async () => {
    const created = await createRental().expect(201);
    await expect(
      prisma.rental.create({
        data: {
          tenantId,
          customerId,
          rentalNumber: created.body.rentalNumber,
          status: "DRAFT",
          plannedStart: new Date(dateOffset(1)),
          plannedEnd: new Date(dateOffset(4)),
          currency: "USD",
          createdByUserId: (await prisma.tenantMembership.findFirstOrThrow({ where: { tenantId } }))
            .userId,
        },
      }),
    ).rejects.toThrow();
  });
});
