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
    isOverdue: boolean;
    overdueSince: string | null;
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
        isOverdue: boolean;
        overdueSince: string | null;
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

  /**
   * Creates a genuinely ACTIVE rental whose plannedStart/plannedEnd are
   * whatever the test needs — including in the past, to simulate a rental
   * that started on schedule and later became overdue. Since RentalsService.
   * start() itself now rejects an already-past plannedStart (see
   * rentals.service.ts's "cannot activate a rental whose planned start has
   * already passed" rule), this creates with a safely-near-future
   * plannedStart, starts it for real (so the real syncAssetStatuses side
   * effect — Asset.currentStatusId -> RENTED — genuinely happens), then
   * backdates plannedStart/plannedEnd directly via Prisma to the values the
   * test scenario actually needs — exactly mirroring how a real overdue
   * rental arises (started on time, time passes), never a rental "started"
   * with an already-past planned start, which the API itself no longer allows.
   */
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

  async function rentalDetail(rentalId: string): Promise<{
    isOverdue: boolean;
    overdueSince: string | null;
    status: string;
  }> {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${rentalId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    return response.body;
  }

  const HOUR_MS = 60 * 60 * 1000;

  // A: active rental right now.
  it("active rental right now -> Available now = No, reason RENTED", async () => {
    const assetId = await createAsset("GEN-A");
    const now = new Date();
    await createActiveRental(
      assetId,
      new Date(now.getTime() - HOUR_MS),
      new Date(now.getTime() + HOUR_MS),
    );

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("RENTED");
    expect(row.currentStatus.code).toBe("RENTED");
  });

  // A2: REGRESSION — reproduces the real production case ("Mieszkanie 119" /
  // RNT-000006, 2026-09-02 walkthrough): a rental whose plannedStart is
  // still in the future gets started early for real (RentalsService.start()
  // explicitly allows this — it only rejects an already-*past* plannedStart,
  // see its own doc comment). AvailabilityService.checkAvailability's
  // candidate query used to filter solely on `rental.plannedStart < now`,
  // so an item whose rental had a *future* plannedStart was silently
  // excluded from consideration entirely — even though the rental was
  // genuinely ACTIVE and actualStart had already happened. Root cause:
  // the query never considered `actualStart` (the real occupancy start for
  // an ACTIVE rental) as an alternative to plannedStart. Fixed in
  // AvailabilityService.checkAvailability's candidate query (see its own
  // doc comment) — this test would have failed before that fix (isAvailableNow
  // would have wrongly been `true`).
  it("REGRESSION: an ACTIVE rental started early (actualStart before its own future plannedStart) still makes the asset unavailable now", async () => {
    const assetId = await createAsset("GEN-A2");
    const now = new Date();
    const futurePlannedStart = new Date(now.getTime() + 2 * HOUR_MS);
    const rentalId = await createRental(
      assetId,
      futurePlannedStart,
      new Date(now.getTime() + 26 * HOUR_MS),
    );
    await reserveAndStart(rentalId); // real /start call — actualStart = now, well before plannedStart

    const row = await listRow(assetId);
    expect(row.isAvailableNow).toBe(false);
    expect(row.unavailableReason).toBe("RENTED");
    expect(row.currentStatus.code).toBe("RENTED");
    expect(row.isOverdue).toBe(false); // started early, still well within its planned window
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
    const rentalId = await createActiveRental(
      assetId,
      new Date(now.getTime() - 5 * HOUR_MS),
      new Date(now.getTime() - 2 * HOUR_MS),
    );
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

  describe("overdue returns (unreturned rentals stay blocked past their planned end)", () => {
    // Regression coverage for the exact real case found in live data
    // ("Agregat Honda"): an ACTIVE rental whose plannedEnd has already
    // passed, never actually returned.

    // A: still inside the planned period, not returned -> unavailable, not overdue.
    it("rental currently inside its planned period, not returned -> unavailable now, not overdue", async () => {
      const assetId = await createAsset("OD-A");
      const now = new Date();
      await createActiveRental(
        assetId,
        new Date(now.getTime() - HOUR_MS),
        new Date(now.getTime() + HOUR_MS),
      );

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false);
      expect(row.unavailableReason).toBe("RENTED");
      expect(row.isOverdue).toBe(false);
      expect(row.overdueSince).toBeNull();
    });

    // B: planned end passed, not returned -> unavailable, overdue = true.
    it("planned end passed, not returned -> unavailable now, overdue = true, reason OVERDUE_RETURN", async () => {
      const assetId = await createAsset("OD-B");
      const now = new Date();
      const plannedEnd = new Date(now.getTime() - 2 * HOUR_MS);
      await createActiveRental(assetId, new Date(now.getTime() - 5 * HOUR_MS), plannedEnd);

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false);
      expect(row.unavailableReason).toBe("OVERDUE_RETURN");
      expect(row.isOverdue).toBe(true);
      expect(row.overdueSince).toBe(plannedEnd.toISOString());
      // The persisted Status label stays "Rented" (the best-effort field
      // this task deliberately never overwrites); the derived display in
      // the frontend layer overrides it — asserted at the API level here
      // only via the raw currentStatus code.
      expect(row.currentStatus.code).toBe("RENTED");
    });

    // C: planned end passed + actual return completed -> available again.
    it("planned end passed, but actually returned -> available now, overdue = false", async () => {
      const assetId = await createAsset("OD-C");
      const now = new Date();
      const rentalId = await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        new Date(now.getTime() - 2 * HOUR_MS), // already overdue before the return
      );

      // Confirm it is genuinely overdue first — proves the return is what fixes it.
      expect((await listRow(assetId)).isOverdue).toBe(true);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rentalId}/return`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(true);
      expect(row.unavailableReason).toBeNull();
      expect(row.isOverdue).toBe(false);
      expect(row.overdueSince).toBeNull();
      expect(row.currentStatus.code).toBe("AVAILABLE");
    });

    // D: a Return Protocol *document* was generated (drafted) but the real
    // return() action was never called — must NOT release the asset.
    it("a drafted Return Protocol document alone does not release an overdue asset", async () => {
      const assetId = await createAsset("OD-D");
      const now = new Date();
      const rentalId = await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        new Date(now.getTime() - 2 * HOUR_MS),
      );

      // Generate a Return Protocol document — paperwork only, see
      // rental-overdue.util.ts's doc comment: this must never set
      // RentalItem.returnedAt.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/documents`)
        .set("Cookie", accessCookie)
        .send({ documentType: "RETURN_PROTOCOL", rentalId, customerId })
        .expect(201);

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false);
      expect(row.isOverdue).toBe(true);
      expect(row.unavailableReason).toBe("OVERDUE_RETURN");
    });

    // E: future rental only -> available today (unaffected, already covered
    // by the top-level "future rental only" test above — re-asserted here
    // for this describe block's own completeness).
    it("future rental only -> available now today, never overdue", async () => {
      const assetId = await createAsset("OD-E");
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
      expect(row.isOverdue).toBe(false);
    });

    // F: a fully-returned past rental -> available, never overdue (already
    // covered by the top-level "past rental only" test — re-confirmed here
    // for isOverdue specifically).
    it("a fully-returned past rental -> available now, isOverdue false", async () => {
      const assetId = await createAsset("OD-F");
      const now = new Date();
      const rentalId = await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        new Date(now.getTime() - 2 * HOUR_MS),
      );
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rentalId}/return`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(true);
      expect(row.isOverdue).toBe(false);
    });

    // G: overdue rental + an attempted future reservation on the same asset
    // -> the future booking is rejected, proving overdue blocking has no end date.
    it("overdue rental blocks a future reservation attempt on the same asset (overlap protection preserved)", async () => {
      const assetId = await createAsset("OD-G");
      const now = new Date();
      await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        new Date(now.getTime() - 2 * HOUR_MS),
      );

      // A different customer tries to book the same (still-overdue,
      // never-returned) asset for next week.
      const futureAttempt = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          plannedStart: new Date(now.getTime() + 7 * 24 * HOUR_MS).toISOString(),
          plannedEnd: new Date(now.getTime() + 8 * 24 * HOUR_MS).toISOString(),
          items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
        })
        .expect(201); // creating a DRAFT rental itself is always allowed…

      // …but reserving it must fail: the asset is still claimed by the
      // overdue, unreturned rental, with no known end date.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${futureAttempt.body.id}/reserve`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(409);
    });

    // H: overdue rental + a maintenance block -> still unavailable (both
    // reasons exist; the rental conflict is reported first).
    it("overdue rental plus a maintenance block -> still unavailable", async () => {
      const assetId = await createAsset("OD-H");
      const now = new Date();
      await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        new Date(now.getTime() - 2 * HOUR_MS),
      );
      await createBlock(
        assetId,
        "MAINTENANCE",
        new Date(now.getTime() - HOUR_MS),
        new Date(now.getTime() + HOUR_MS),
      );

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false);
    });

    // I: LOST/RETIRED semantics unchanged by this feature.
    it("LOST still reports unavailable with reason LOST, unaffected by overdue logic", async () => {
      const assetId = await createAsset("OD-I");
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/assets/${assetId}/status`)
        .set("Cookie", accessCookie)
        .send({ statusId: statusIdByCode.get("LOST") })
        .expect(201);

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false);
      expect(row.unavailableReason).toBe("LOST");
      expect(row.isOverdue).toBe(false);
    });

    // J: boundary — at the exact planned-end instant, not yet overdue (see
    // rental-overdue.util.spec.ts and availability.service.spec.ts for the
    // precise millisecond-level boundary proof; this confirms the same
    // behavior survives the full HTTP + real-Postgres pipeline).
    it("boundary: a rental exactly at its planned end (not past it) is not yet overdue", async () => {
      const assetId = await createAsset("OD-J");
      const now = new Date();
      // plannedEnd a few seconds in the future — by the time the list
      // request executes, well before it, so this proves "not overdue
      // while still within or at the boundary of the planned window",
      // without depending on hitting an exact millisecond in a live HTTP
      // round trip.
      await createActiveRental(
        assetId,
        new Date(now.getTime() - HOUR_MS),
        new Date(now.getTime() + 30_000),
      );

      const row = await listRow(assetId);
      expect(row.isAvailableNow).toBe(false); // still blocked — within its planned window
      expect(row.isOverdue).toBe(false); // but not yet overdue
    });

    // K: cross-tenant isolation unchanged.
    it("cross-tenant: another tenant's overdue rental never affects this tenant's asset of the same name", async () => {
      const otherRegister = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          ...validRegisterPayload,
          email: "other-owner@example.com",
          companyName: "Other Co",
        })
        .expect(201);
      const otherTenantId = (otherRegister.body as RegisterResponseBody).tenant.id;
      const otherCookie = extractCookie(otherRegister.headers, "rentos_access_token");

      const otherCategory = await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/asset-categories`)
        .set("Cookie", otherCookie)
        .send({ name: "Generators" })
        .expect(201);
      const otherAsset = await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/assets`)
        .set("Cookie", otherCookie)
        .send({ name: "Shared Name", internalNumber: "OD-K", categoryId: otherCategory.body.id })
        .expect(201);
      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/customers`)
        .set("Cookie", otherCookie)
        .send({ firstName: "Other", lastName: "Customer" })
        .expect(201);
      const now = new Date();
      // plannedStart is safely near-future at creation time (start() itself
      // now rejects an already-past planned start — see createActiveRental's
      // doc comment above), then backdated directly via Prisma afterwards to
      // simulate a rental that started on schedule and later went overdue.
      const otherRental = await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/rentals`)
        .set("Cookie", otherCookie)
        .send({
          customerId: otherCustomer.body.id,
          plannedStart: new Date(Date.now() + 2000).toISOString(),
          plannedEnd: new Date(Date.now() + HOUR_MS).toISOString(),
          items: [{ assetId: otherAsset.body.id, billingMode: "DAILY", dailyPriceMinor: 1000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/rentals/${otherRental.body.id}/reserve`)
        .set("Cookie", otherCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${otherTenantId}/rentals/${otherRental.body.id}/start`)
        .set("Cookie", otherCookie)
        .send({})
        .expect(201);
      await prisma.rental.update({
        where: { id: otherRental.body.id },
        data: {
          plannedStart: new Date(now.getTime() - 5 * HOUR_MS),
          plannedEnd: new Date(now.getTime() - 2 * HOUR_MS),
        },
      });

      // This tenant's own, entirely separate asset with the same internal
      // number pattern must be unaffected — never overdue, never blocked.
      const myAssetId = await createAsset("OD-K");
      const row = await listRow(myAssetId);
      expect(row.isAvailableNow).toBe(true);
      expect(row.isOverdue).toBe(false);
    });

    // L: rental detail page — isOverdue/overdueSince, and clears on return.
    it("rental detail: isOverdue/overdueSince are exposed, and clear once the rental is actually returned", async () => {
      const assetId = await createAsset("OD-L");
      const now = new Date();
      const plannedEnd = new Date(now.getTime() - 2 * HOUR_MS);
      const rentalId = await createActiveRental(
        assetId,
        new Date(now.getTime() - 5 * HOUR_MS),
        plannedEnd,
      );

      const overdueDetail = await rentalDetail(rentalId);
      expect(overdueDetail.isOverdue).toBe(true);
      expect(overdueDetail.overdueSince).toBe(plannedEnd.toISOString());

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rentalId}/return`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const returnedDetail = await rentalDetail(rentalId);
      expect(returnedDetail.isOverdue).toBe(false);
      expect(returnedDetail.overdueSince).toBeNull();
      expect(returnedDetail.status).toBe("RETURNED");
    });
  });
});
