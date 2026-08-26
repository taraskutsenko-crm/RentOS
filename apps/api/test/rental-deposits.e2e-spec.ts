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

describe("Rental Deposits E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
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
    const categoryId = categoryResponse.body.id;

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    const assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe" })
      .expect(201);

    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId: customerResponse.body.id,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000, depositMinor: 70000 }],
      })
      .expect(201);
    rentalId = rentalResponse.body.id;
  });

  function dateOffset(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  it("returns null until a deposit receipt has been recorded", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${rentalId}/deposit`)
      .set("Cookie", accessCookie)
      .expect(200);
    // Nest serializes a null controller return as an empty HTTP body;
    // supertest/superagent then parses that empty body as {}.
    expect(response.body).toEqual({});
  });

  it("records a deposit receipt, deriving the required amount from RentalItem.depositMinor", async () => {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({
        receivedAt: dateOffset(1),
        receivedAmountMinor: 70000,
        receivedMethod: "BANK_TRANSFER",
        receivedReference: "TRX-001",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      rentalId,
      requiredAmountMinor: 70000,
      receivedAmountMinor: 70000,
      receivedMethod: "BANK_TRANSFER",
    });
  });

  it("rejects a second receipt while one is already recorded", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(409);
  });

  it("records a full deposit return with no retention", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({ returnedAt: dateOffset(5), returnedAmountMinor: 70000, retainedAmountMinor: 0 })
      .expect(201);

    expect(response.body).toMatchObject({ returnedAmountMinor: 70000, retainedAmountMinor: 0 });
  });

  it("requires a retention reason when retaining any amount", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({ returnedAt: dateOffset(5), returnedAmountMinor: 50000, retainedAmountMinor: 20000 })
      .expect(400);
  });

  it("records a partial return with retention and a reason", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({
        returnedAt: dateOffset(5),
        returnedAmountMinor: 50000,
        retainedAmountMinor: 20000,
        retentionReason: "Minor damage to the generator casing",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      returnedAmountMinor: 50000,
      retainedAmountMinor: 20000,
      retentionReason: "Minor damage to the generator casing",
    });
  });

  it("rejects returned + retained exceeding the amount received", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`)
      .set("Cookie", accessCookie)
      .send({ receivedAt: dateOffset(1), receivedAmountMinor: 70000, receivedMethod: "CASH" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({
        returnedAt: dateOffset(5),
        returnedAmountMinor: 60000,
        retainedAmountMinor: 20000,
        retentionReason: "Damage",
      })
      .expect(400);
  });

  it("404s recording a return before any receipt was recorded", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/deposit/return`)
      .set("Cookie", accessCookie)
      .send({ returnedAt: dateOffset(5), returnedAmountMinor: 0, retainedAmountMinor: 0 })
      .expect(404);
  });
});
