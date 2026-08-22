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

describe("Rental Billing Settings E2E", () => {
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

  async function registerSecondTenant() {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = response.body as RegisterResponseBody;
    const otherCookie = extractCookie(response.headers, "rentos_access_token");
    return { tenantId: otherBody.tenant.id, cookie: otherCookie };
  }

  async function registerMember(role: string) {
    const email = `${role.toLowerCase()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName: `${role} Co` })
      .expect(201);
    const memberBody = registerResponse.body as RegisterResponseBody;
    const cookie = extractCookie(registerResponse.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: memberBody.user.id, role: role as never, status: "ACTIVE" },
    });
    return cookie;
  }

  it("defaults an existing tenant with no stored row to CALENDAR_MONTH", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body).toMatchObject({
      tenantId,
      monthlyBillingStrategy: "CALENDAR_MONTH",
      customMonthLengthDays: null,
      isDefault: true,
    });
  });

  it("updates the strategy to FIXED_30_DAYS and persists it", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({ monthlyBillingStrategy: "FIXED_30_DAYS", partialMonthPolicy: "PRORATE_BY_DAY" })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body).toMatchObject({
      monthlyBillingStrategy: "FIXED_30_DAYS",
      customMonthLengthDays: null,
      isDefault: false,
    });
  });

  it("updates the strategy to CUSTOM with a valid customMonthLengthDays", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({
        monthlyBillingStrategy: "CUSTOM",
        customMonthLengthDays: 28,
        partialMonthPolicy: "PRORATE_BY_DAY",
      })
      .expect(200);

    expect(response.body).toMatchObject({
      monthlyBillingStrategy: "CUSTOM",
      customMonthLengthDays: 28,
    });
  });

  it("rejects CUSTOM without a customMonthLengthDays", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({ monthlyBillingStrategy: "CUSTOM", partialMonthPolicy: "PRORATE_BY_DAY" })
      .expect(400);
  });

  it("rejects an out-of-range customMonthLengthDays (0, negative, over 365, decimal)", async () => {
    for (const value of [0, -5, 366, 28.5]) {
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", accessCookie)
        .send({
          monthlyBillingStrategy: "CUSTOM",
          customMonthLengthDays: value,
          partialMonthPolicy: "PRORATE_BY_DAY",
        })
        .expect(400);
    }
  });

  it("ignores customMonthLengthDays for non-CUSTOM strategies rather than storing it", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: 28,
        partialMonthPolicy: "PRORATE_BY_DAY",
      })
      .expect(200);

    expect(response.body.customMonthLengthDays).toBeNull();
  });

  it("rejects an unsupported strategy value", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({ monthlyBillingStrategy: "WEEKLY_ISH" })
      .expect(400);
  });

  it("defaults an existing tenant with no stored row to PRORATE_BY_DAY (D-072)", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.partialMonthPolicy).toBe("PRORATE_BY_DAY");
  });

  it("updates the partial-month policy to ROUND_UP_TO_FULL_MONTH and persists it", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({
        monthlyBillingStrategy: "CALENDAR_MONTH",
        partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.partialMonthPolicy).toBe("ROUND_UP_TO_FULL_MONTH");
  });

  it("rejects a missing partialMonthPolicy", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({ monthlyBillingStrategy: "CALENDAR_MONTH" })
      .expect(400);
  });

  it("rejects an unsupported partialMonthPolicy value", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({
        monthlyBillingStrategy: "CALENDAR_MONTH",
        partialMonthPolicy: "SPLIT_THE_DIFFERENCE",
      })
      .expect(400);
  });

  it("writes an audit log entry on update", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", accessCookie)
      .send({ monthlyBillingStrategy: "FIXED_30_DAYS", partialMonthPolicy: "PRORATE_BY_DAY" })
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, action: "rental_billing_settings.updated" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toMatchObject({
      from: { monthlyBillingStrategy: "CALENDAR_MONTH" },
      to: { monthlyBillingStrategy: "FIXED_30_DAYS" },
    });
  });

  it("rejects cross-tenant access to billing settings", async () => {
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", other.cookie)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", other.cookie)
      .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
      .expect(403);
  });

  it("allows MANAGER/ACCOUNTANT/VIEWER to view but not manage", async () => {
    for (const role of ["MANAGER", "ACCOUNTANT", "VIEWER"]) {
      const cookie = await registerMember(role);

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", cookie)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}/rental-billing-settings`)
        .set("Cookie", cookie)
        .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
        .expect(403);
    }
  });

  it("blocks TECHNICIAN from viewing or managing billing settings", async () => {
    const cookie = await registerMember("TECHNICIAN");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", cookie)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/rental-billing-settings`)
      .set("Cookie", cookie)
      .send({ monthlyBillingStrategy: "FIXED_30_DAYS" })
      .expect(403);
  });
});
