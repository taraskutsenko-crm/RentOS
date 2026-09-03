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

/**
 * Havelio Billing (Stage 17) — server-enforced, concurrency-safe plan
 * limits. Proves the exact scenario the task itself calls out: "49 assets
 * -> two simultaneous requests -> must never become 51" — see
 * EntitlementsService.assertCanCreateAsset's own doc comment for the
 * pg_advisory_xact_lock mechanism this test verifies.
 */
describe("Billing entitlements E2E — asset limit enforcement", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let categoryId: string;
  let availableStatusId: string;
  let createdByUserId: string;

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
    createdByUserId = body.user.id;
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Vehicles" })
      .expect(201);
    categoryId = categoryResponse.body.id;

    const statusesResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/asset-statuses`)
      .set("Cookie", accessCookie)
      .expect(200);
    availableStatusId = statusesResponse.body.find(
      (s: { code: string }) => s.code === "AVAILABLE",
    ).id;

    // Registration starts a TRIALING subscription with full PROFESSIONAL-
    // tier (unlimited-asset) access — see SubscriptionsService.startTrial.
    // This test needs the STARTER plan's real 50-asset cap in force, so it
    // moves the subscription to an ACTIVE STARTER state directly (the same
    // state a real completed Stripe checkout would leave it in — this test
    // is about the limit-enforcement mechanism, not the Stripe integration
    // itself, which billing.e2e-spec.ts covers separately).
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.havelioSubscription.update({
      where: { tenantId },
      data: {
        plan: "STARTER",
        billingInterval: "MONTHLY",
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
  });

  async function seedAssets(count: number): Promise<void> {
    const data = Array.from({ length: count }, (_, i) => ({
      tenantId,
      categoryId,
      currentStatusId: availableStatusId,
      name: `Seed Asset ${i}`,
      internalNumber: `SEED-${String(i).padStart(4, "0")}`,
      createdByUserId,
    }));
    await prisma.asset.createMany({ data });
  }

  function createAssetRequest(internalNumber: string) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "New Asset", internalNumber, categoryId });
  }

  it("blocks asset creation once the plan's 50-asset limit is reached", async () => {
    await seedAssets(50);

    const response = await createAssetRequest("OVER-LIMIT-1").expect(403);
    expect(response.body).toMatchObject({
      code: "ENTITLEMENT_DENIED",
      reason: { type: "LIMIT", resource: "assets", current: 50, limit: 50 },
    });

    const count = await prisma.asset.count({ where: { tenantId } });
    expect(count).toBe(50);
  });

  it("never allows two concurrent requests at the boundary to create 51 assets (49 -> exactly 50, never 51)", async () => {
    await seedAssets(49);

    const [resultA, resultB] = await Promise.all([
      createAssetRequest("RACE-A"),
      createAssetRequest("RACE-B"),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    // Exactly one request must succeed (reaching the 50-asset cap) and the
    // other must be denied — never both succeeding (which would silently
    // exceed the plan's limit).
    expect(statuses).toEqual([201, 403]);

    const denied = resultA.status === 403 ? resultA : resultB;
    expect(denied.body).toMatchObject({ code: "ENTITLEMENT_DENIED", reason: { type: "LIMIT", resource: "assets" } });

    const count = await prisma.asset.count({ where: { tenantId } });
    expect(count).toBe(50);
  });

  it("allows asset creation while under the limit", async () => {
    await seedAssets(48);
    await createAssetRequest("UNDER-LIMIT-1").expect(201);

    const count = await prisma.asset.count({ where: { tenantId } });
    expect(count).toBe(49);
  });
});
