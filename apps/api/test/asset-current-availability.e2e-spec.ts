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
 * Proves the Assets list's "available right now" column reflects the real
 * canonical availability engine (AvailabilityService.checkAvailableNow) at
 * request time, not a stale persisted status or the static
 * Asset.isRentable configuration flag alone — see
 * asset-current-availability.util.ts and AssetsService.findMany.
 */
describe("Asset current availability (Assets list) E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let statusIdByCode: Map<string, string>;

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

  async function listRow(assetId: string): Promise<{
    isAvailableNow: boolean;
    unavailableReason: string | null;
    currentStatus: { code: string };
  }> {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .expect(200);
    const row = (
      response.body.items as {
        id: string;
        isAvailableNow: boolean;
        unavailableReason: string | null;
        currentStatus: { code: string };
      }[]
    ).find((item) => item.id === assetId);
    if (!row) throw new Error(`Asset ${assetId} not found in list response`);
    return row;
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

  async function createBlock(
    assetId: string,
    type: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", accessCookie)
      .send({ type, startAt: startAt.toISOString(), endAt: endAt.toISOString() })
      .expect(201);
  }

  const HOUR_MS = 60 * 60 * 1000;

  // A: active rental right now.
  it("active rental right now -> Available now = No, reason RENTED", async () => {
    const assetId = await createAsset("GEN-A");
    const now = new Date();
    const rentalId = await createRental(
      assetId,
      new Date(now.getTime() - HOUR_MS),
      new Date(now.getTime() + HOUR_MS),
    );
    await reserveAndStart(rentalId);

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("RENTED");
    expect(row.currentStatus.code).toBe("RENTED");
  });

  // B: future rental only -> today unaffected.
  it("future rental only -> Available now = Yes (today unaffected by a future booking)", async () => {
    const assetId = await createAsset("GEN-B");
    const now = new Date();
    const rentalId = await createRental(
      assetId,
      new Date(now.getTime() + 7 * 24 * HOUR_MS),
      new Date(now.getTime() + 12 * 24 * HOUR_MS),
    );
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/reserve`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(true);
    expect(row.unavailableReason).toBeNull();
    // The reservation itself must never flip the asset's own status to Rented.
    expect(row.currentStatus.code).not.toBe("RENTED");
  });

  // C: past rental only (already returned) -> no longer blocks today.
  it("past rental only (returned) -> Available now = Yes", async () => {
    const assetId = await createAsset("GEN-C");
    const now = new Date();
    const rentalId = await createRental(
      assetId,
      new Date(now.getTime() - 5 * HOUR_MS),
      new Date(now.getTime() - 2 * HOUR_MS),
    );
    await reserveAndStart(rentalId);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rentalId}/return`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(true);
    expect(row.unavailableReason).toBeNull();
  });

  // D: current maintenance block.
  it("current maintenance block -> Available now = No, reason MAINTENANCE", async () => {
    const assetId = await createAsset("GEN-D");
    const now = new Date();
    await createBlock(
      assetId,
      "MAINTENANCE",
      new Date(now.getTime() - HOUR_MS),
      new Date(now.getTime() + HOUR_MS),
    );

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("MAINTENANCE");
  });

  // E: future maintenance block -> available today.
  it("future maintenance block -> Available now = Yes today", async () => {
    const assetId = await createAsset("GEN-E");
    const now = new Date();
    await createBlock(
      assetId,
      "MAINTENANCE",
      new Date(now.getTime() + 7 * 24 * HOUR_MS),
      new Date(now.getTime() + 8 * 24 * HOUR_MS),
    );

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(true);
    expect(row.unavailableReason).toBeNull();
  });

  // F: manual current block.
  it("manual current block -> Available now = No, reason MANUAL_BLOCK", async () => {
    const assetId = await createAsset("GEN-F");
    const now = new Date();
    await createBlock(
      assetId,
      "MANUAL_BLOCK",
      new Date(now.getTime() - HOUR_MS),
      new Date(now.getTime() + HOUR_MS),
    );

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("MANUAL_BLOCK");
  });

  // G: LOST.
  it("LOST status -> Available now = No, reason LOST", async () => {
    const assetId = await createAsset("GEN-G");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/status`)
      .set("Cookie", accessCookie)
      .send({ statusId: statusIdByCode.get("LOST") })
      .expect(201);

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("LOST");
  });

  // H: RETIRED.
  it("RETIRED status -> Available now = No, reason RETIRED", async () => {
    const assetId = await createAsset("GEN-H");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/status`)
      .set("Cookie", accessCookie)
      .send({ statusId: statusIdByCode.get("RETIRED") })
      .expect(201);

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("RETIRED");
  });

  // I: rentable/configuration disabled.
  it("isRentable = false (configuration disabled) -> Available now = No, reason NOT_RENTABLE", async () => {
    const assetId = await createAsset("GEN-I", { isRentable: false });

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("NOT_RENTABLE");
  });

  // J: no blocking intervals + rentable.
  it("no blocking intervals, rentable -> Available now = Yes", async () => {
    const assetId = await createAsset("GEN-J");

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(true);
    expect(row.unavailableReason).toBeNull();
    expect(row.currentStatus.code).toBe("AVAILABLE");
  });

  // K: boundary — a block that has already ended must not block "now".
  it("boundary: a block whose window has already fully ended does not block now", async () => {
    const assetId = await createAsset("GEN-K");
    const now = new Date();
    await createBlock(
      assetId,
      "MAINTENANCE",
      new Date(now.getTime() - 3 * HOUR_MS),
      new Date(now.getTime() - HOUR_MS), // ended an hour ago
    );

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(true);
  });
});
