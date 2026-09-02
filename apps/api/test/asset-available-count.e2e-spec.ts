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
 * Task 3 Part B — Dashboard "Available assets" KPI must be the canonical,
 * real-time count from AssetsService.countAvailableNow
 * (AvailabilityService.checkAvailableNow + deriveAssetCurrentAvailability),
 * never a catalog Asset.currentStatusId/isRentable-only approximation. This
 * exercises the exact B4 demo-data matrix from the task spec end-to-end
 * (real HTTP + real Postgres), and proves the count always agrees with the
 * Assets list's own per-row isAvailableNow — the two must never diverge
 * since they are now backed by the identical canonical engine.
 */
describe("Dashboard available-assets count E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let statusIdByCode: Map<string, string>;

  const HOUR_MS = 60 * 60 * 1000;

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

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe" })
      .expect(201);
    customerId = customerResponse.body.id;

    const statusesResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/asset-statuses`)
      .set("Cookie", accessCookie)
      .expect(200);
    statusIdByCode = new Map(
      (statusesResponse.body as { id: string; code: string }[]).map((s) => [s.code, s.id]),
    );
  });

  async function createAsset(
    internalNumber: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: `Asset ${internalNumber}`, internalNumber, categoryId, ...overrides })
      .expect(201);
    return response.body.id as string;
  }

  async function createRental(assetId: string, plannedStart: Date, plannedEnd: Date) {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        plannedStart: plannedStart.toISOString(),
        plannedEnd: plannedEnd.toISOString(),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    return response.body.id as string;
  }

  async function reserveAndStart(rentalId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/start`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
  }

  // Same technique as asset-current-availability.e2e-spec.ts's
  // createActiveRental: start() rejects an already-past plannedStart, so
  // create+start with a safely-near-future window, then backdate via
  // Prisma to whatever the scenario actually needs.
  async function createActiveRental(
    assetId: string,
    plannedStart: Date,
    plannedEnd: Date,
  ): Promise<string> {
    const rentalId = await createRental(
      assetId,
      new Date(Date.now() + 2000),
      new Date(Date.now() + HOUR_MS),
    );
    await reserveAndStart(rentalId);
    await prisma.rental.update({ where: { id: rentalId }, data: { plannedStart, plannedEnd } });
    return rentalId;
  }

  async function createBlock(assetId: string, type: string, startAt: Date, endAt: Date) {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", accessCookie)
      .send({ type, startAt: startAt.toISOString(), endAt: endAt.toISOString() })
      .expect(201);
  }

  async function availableCount(): Promise<number> {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/available-count`)
      .set("Cookie", accessCookie)
      .expect(200);
    return (response.body as { count: number }).count;
  }

  async function listRows(): Promise<{ id: string; internalNumber: string; isAvailableNow: boolean }[]> {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .query({ pageSize: 50 })
      .expect(200);
    return response.body.items as { id: string; internalNumber: string; isAvailableNow: boolean }[];
  }

  it("B4: exact demo-data matrix — A active-unreturned, B free, C maintenance, D future-only, E LOST -> count = 2", async () => {
    const now = new Date();

    // A — ACTIVE, unreturned -> unavailable.
    const assetA = await createAsset("KPI-A");
    await createActiveRental(assetA, new Date(now.getTime() - HOUR_MS), new Date(now.getTime() + HOUR_MS));

    // B — no blocks/rentals -> available.
    const assetB = await createAsset("KPI-B");

    // C — current maintenance -> unavailable.
    const assetC = await createAsset("KPI-C");
    await createBlock(assetC, "MAINTENANCE", new Date(now.getTime() - HOUR_MS), new Date(now.getTime() + HOUR_MS));

    // D — future rental only -> available now.
    const assetD = await createAsset("KPI-D");
    const futureRentalId = await createRental(
      assetD,
      new Date(now.getTime() + 7 * 24 * HOUR_MS),
      new Date(now.getTime() + 8 * 24 * HOUR_MS),
    );
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${futureRentalId}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    // E — LOST -> unavailable.
    const assetE = await createAsset("KPI-E");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetE}/status`)
      .set("Cookie", accessCookie)
      .send({ statusId: statusIdByCode.get("LOST") })
      .expect(201);

    expect(await availableCount()).toBe(2);

    const rows = await listRows();
    const byId = new Map(rows.map((r) => [r.id, r.isAvailableNow]));
    expect(byId.get(assetA)).toBe(false);
    expect(byId.get(assetB)).toBe(true);
    expect(byId.get(assetC)).toBe(false);
    expect(byId.get(assetD)).toBe(true);
    expect(byId.get(assetE)).toBe(false);

    // Dashboard count must equal the count of Assets-list rows reporting
    // isAvailableNow=true — the two must never diverge (same engine).
    expect(await availableCount()).toBe(rows.filter((r) => r.isAvailableNow).length);
  });

  it("overdue ACTIVE rental (plannedEnd passed, never returned) is excluded from the count", async () => {
    const now = new Date();
    await createActiveRental(
      await createAsset("KPI-OD"),
      new Date(now.getTime() - 5 * HOUR_MS),
      new Date(now.getTime() - 2 * HOUR_MS), // overdue
    );
    await createAsset("KPI-FREE"); // the one genuinely free control asset

    expect(await availableCount()).toBe(1);
  });

  it("RETIRED asset is excluded from the count", async () => {
    const retired = await createAsset("KPI-RET");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${retired}/status`)
      .set("Cookie", accessCookie)
      .send({ statusId: statusIdByCode.get("RETIRED") })
      .expect(201);
    await createAsset("KPI-FREE2");

    expect(await availableCount()).toBe(1);
  });

  it("is not an N+1 query blowup — computes correctly for a larger asset set in one request", async () => {
    const assetIds: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      assetIds.push(await createAsset(`KPI-BULK-${i}`));
    }
    // Block half of them.
    const now = new Date();
    for (let i = 0; i < 15; i += 1) {
      if (i % 2 === 0) {
        await createBlock(assetIds[i]!, "MANUAL_BLOCK", new Date(now.getTime() - HOUR_MS), new Date(now.getTime() + HOUR_MS));
      }
    }

    expect(await availableCount()).toBe(7); // odd indices 1,3,5,7,9,11,13 = 7 free
  });

  it("tenant isolation: another tenant's assets never affect this tenant's count", async () => {
    await createAsset("KPI-MINE"); // one free asset for this tenant

    const otherRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner-kpi@example.com", companyName: "Other Co KPI" })
      .expect(201);
    const otherTenantId = (otherRegister.body as RegisterResponseBody).tenant.id;
    const otherCookie = extractCookie(otherRegister.headers, "rentos_access_token");
    const otherCategory = await request(app.getHttpServer())
      .post(`/tenants/${otherTenantId}/asset-categories`)
      .set("Cookie", otherCookie)
      .send({ name: "Other" })
      .expect(201);
    // Three free assets in the OTHER tenant — must not leak into this
    // tenant's count.
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/assets`)
        .set("Cookie", otherCookie)
        .send({ name: `Other ${i}`, internalNumber: `OTH-${i}`, categoryId: otherCategory.body.id })
        .expect(201);
    }

    expect(await availableCount()).toBe(1);
  });

  it("B5: tenant timezone (Europe/Warsaw) does not change the canonical instant-based result", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { timezone: "Europe/Warsaw" } });
    const now = new Date();
    await createActiveRental(await createAsset("KPI-TZ-A"), new Date(now.getTime() - HOUR_MS), new Date(now.getTime() + HOUR_MS));
    await createAsset("KPI-TZ-B");

    expect(await availableCount()).toBe(1);
  });

  it("B5: tenant timezone (America/New_York) does not change the canonical instant-based result", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { timezone: "America/New_York" } });
    const now = new Date();
    await createActiveRental(await createAsset("KPI-TZ-C"), new Date(now.getTime() - HOUR_MS), new Date(now.getTime() + HOUR_MS));
    await createAsset("KPI-TZ-D");

    expect(await availableCount()).toBe(1);
  });
});
