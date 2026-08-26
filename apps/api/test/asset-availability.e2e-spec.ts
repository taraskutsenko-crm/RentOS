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

describe("Asset Availability Blocks E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
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
  });

  function dateOffset(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  function createBlock(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", accessCookie)
      .send({
        type: "MAINTENANCE",
        startAt: dateOffset(10),
        endAt: dateOffset(12),
        ...overrides,
      });
  }

  it("creates a maintenance block and lists it for the asset", async () => {
    const createResponse = await createBlock().expect(201);
    expect(createResponse.body).toMatchObject({ assetId, type: "MAINTENANCE" });

    const listResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(listResponse.body).toHaveLength(1);
  });

  it("rejects an overlapping block on the same asset", async () => {
    await createBlock({ startAt: dateOffset(10), endAt: dateOffset(15) }).expect(201);

    await createBlock({ type: "REPAIR", startAt: dateOffset(12), endAt: dateOffset(20) }).expect(
      409,
    );
  });

  it("allows back-to-back blocks (half-open interval)", async () => {
    await createBlock({ startAt: dateOffset(10), endAt: dateOffset(15) }).expect(201);

    await createBlock({ type: "REPAIR", startAt: dateOffset(15), endAt: dateOffset(20) }).expect(
      201,
    );
  });

  it("a future block does not make the asset unavailable today, but does for its own window", async () => {
    await createBlock({ startAt: dateOffset(30), endAt: dateOffset(32) }).expect(201);

    const availabilityNow = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .set("Cookie", accessCookie)
      .query({
        assetIds: assetId,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
      })
      .expect(200);
    expect(availabilityNow.body.results[0]).toMatchObject({ isAvailable: true, blocks: [] });

    const availabilityDuringBlock = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .set("Cookie", accessCookie)
      .query({
        assetIds: assetId,
        plannedStart: dateOffset(31),
        plannedEnd: dateOffset(33),
      })
      .expect(200);
    expect(availabilityDuringBlock.body.results[0].isAvailable).toBe(false);
    expect(availabilityDuringBlock.body.results[0].blocks).toHaveLength(1);
  });

  it("cancelling a block restores availability for that window", async () => {
    const created = await createBlock({ startAt: dateOffset(10), endAt: dateOffset(12) }).expect(
      201,
    );

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({ reason: "Maintenance no longer needed" })
      .expect(201);

    const availability = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/availability`)
      .set("Cookie", accessCookie)
      .query({
        assetIds: assetId,
        plannedStart: dateOffset(10),
        plannedEnd: dateOffset(12),
      })
      .expect(200);
    expect(availability.body.results[0]).toMatchObject({ isAvailable: true, blocks: [] });
  });

  it("cannot cancel an already-cancelled block", async () => {
    const created = await createBlock().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  it("rejects endAt <= startAt", async () => {
    await createBlock({ startAt: dateOffset(12), endAt: dateOffset(10) }).expect(400);
  });

  it("blocks reserving a rental whose dates overlap an existing maintenance block (single source of truth)", async () => {
    await createBlock({ startAt: dateOffset(5), endAt: dateOffset(9) }).expect(201);

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
        plannedStart: dateOffset(6),
        plannedEnd: dateOffset(8),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalResponse.body.id}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);
  });

  it("404s creating a block for an asset in a different tenant", async () => {
    const otherRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = otherRegister.body as RegisterResponseBody;
    const otherCookie = extractCookie(otherRegister.headers, "rentos_access_token");

    await request(app.getHttpServer())
      .post(`/tenants/${otherBody.tenant.id}/assets/${assetId}/availability-blocks`)
      .set("Cookie", otherCookie)
      .send({ type: "MAINTENANCE", startAt: dateOffset(10), endAt: dateOffset(12) })
      .expect(404);
  });

  // RBAC: assets.manage_availability is required to create/cancel a block —
  // VIEWER has neither (see permission.ts), mirrors the exact
  // register-a-second-membership-row pattern assets.e2e-spec.ts already
  // uses for its own "blocks a VIEWER-role member" regression test.
  it("blocks a VIEWER-role member from creating or cancelling a block but allows reading", async () => {
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
      .get(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", viewerCookie)
      .send({ type: "MAINTENANCE", startAt: dateOffset(10), endAt: dateOffset(12) })
      .expect(403);

    const created = await createBlock().expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks/${created.body.id}/cancel`)
      .set("Cookie", viewerCookie)
      .send({})
      .expect(403);
  });
});
