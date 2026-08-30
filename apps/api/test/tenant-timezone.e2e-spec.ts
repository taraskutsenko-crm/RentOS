import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { tenantLocalToUtc } from "@rentos/shared";
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
 * End-to-end coverage for the tenant-timezone normalization work (see
 * docs/DECISIONS.md D-115) — the real API/DB round trip on top of
 * `apps/api/src/common/tenant-timezone.spec.ts`'s unit-level DST/round-trip
 * matrix. Registers dedicated tenants at Europe/Warsaw and America/New_York
 * (never assuming UTC) to prove every case is genuinely timezone-correct,
 * not accidentally correct only because a test happened to run at a
 * UTC-aligned moment.
 */
describe("Tenant timezone normalization E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

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
  });

  async function registerTenant(email: string, companyName: string, timezone: string) {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName, timezone })
      .expect(201);
    const body = response.body as RegisterResponseBody;
    return {
      tenantId: body.tenant.id,
      cookie: extractCookie(response.headers, "rentos_access_token"),
    };
  }

  async function setupCustomerAndAsset(tenantId: string, cookie: string) {
    const category = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", cookie)
      .send({ name: "Generators" })
      .expect(201);
    const asset = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", cookie)
      .send({ name: "Generator", internalNumber: "GEN-0001", categoryId: category.body.id })
      .expect(201);
    // A second asset — some tests need two independent assets in the same
    // tenant to avoid an unrelated same-asset overlap conflict between two
    // otherwise-independent test rentals (see the boundary test in
    // rentals.e2e-spec.ts for the identical precedent).
    const secondAsset = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", cookie)
      .send({ name: "Generator 2", internalNumber: "GEN-0002", categoryId: category.body.id })
      .expect(201);
    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", cookie)
      .send({ firstName: "Jane", lastName: "Doe" })
      .expect(201);
    return {
      assetId: asset.body.id as string,
      secondAssetId: secondAsset.body.id as string,
      customerId: customer.body.id as string,
    };
  }

  // ---------------------------------------------------------------------
  // Tenant timezone field (Company Profile)
  // ---------------------------------------------------------------------

  it("allows updating the tenant's timezone via PATCH /tenants/:id", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-tz-update@example.com",
      "TZ Update Co",
      "UTC",
    );

    const response = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", cookie)
      .send({
        name: "TZ Update Co",
        timezone: "Europe/Warsaw",
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
      })
      .expect(200);
    expect(response.body.tenant.timezone).toBe("Europe/Warsaw");

    const refetched = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(refetched.body.tenant.timezone).toBe("Europe/Warsaw");
  });

  it("rejects an unrecognized timezone identifier", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-tz-invalid@example.com",
      "TZ Invalid Co",
      "UTC",
    );

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", cookie)
      .send({
        name: "TZ Invalid Co",
        timezone: "Not/AZone",
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
      })
      .expect(400);
  });

  // ---------------------------------------------------------------------
  // API contract: ambiguous offset-less instants are rejected
  // ---------------------------------------------------------------------

  it("rejects a bare offset-less local datetime string on rental create (direct API call)", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-ambiguous@example.com",
      "Ambiguous Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: "2026-08-31T18:50", // no Z, no offset — must be rejected
        plannedEnd: "2026-09-02T18:50",
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(400);
  });

  it("accepts a real UTC-instant (Z-suffixed) rental create", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-unambiguous@example.com",
      "Unambiguous Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: new Date(Date.now() + 60_000).toISOString(),
        plannedEnd: new Date(Date.now() + 3_600_000).toISOString(),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
  });

  // ---------------------------------------------------------------------
  // Round trip: enter tenant-local time, store, reload — same wall clock.
  // ---------------------------------------------------------------------

  it("round-trips a Warsaw-local rental time exactly through create + reload", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-warsaw-roundtrip@example.com",
      "Warsaw Roundtrip Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);

    // The tenant enters "31.08.2026 18:50" — the frontend converts this to
    // a real UTC instant via tenantLocalToUtc before sending, exactly as
    // rental-wizard.tsx does.
    const localReading = "2026-08-31T18:50";
    const plannedStartInstant = tenantLocalToUtc(localReading, "Europe/Warsaw").toISOString();
    const plannedEndInstant = tenantLocalToUtc("2026-09-02T18:50", "Europe/Warsaw").toISOString();

    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: plannedStartInstant,
        plannedEnd: plannedEndInstant,
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);

    const reloaded = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/rentals/${created.body.id}`)
      .set("Cookie", cookie)
      .expect(200);

    // Stored instant, when read back in the tenant's own timezone, must
    // show the exact same wall-clock digits the tenant originally entered.
    const storedInstant = new Date(reloaded.body.plannedStart as string);
    const reconstitutedLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(storedInstant)
      .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {} as Record<string, string>);
    const reconstitutedString = `${reconstitutedLocal.year}-${reconstitutedLocal.month}-${reconstitutedLocal.day}T${reconstitutedLocal.hour}:${reconstitutedLocal.minute}`;
    expect(reconstitutedString).toBe(localReading);
  });

  // ---------------------------------------------------------------------
  // Activation: correct regardless of tenant timezone, independently
  // ---------------------------------------------------------------------

  async function createAndReserve(
    tenantId: string,
    cookie: string,
    assetId: string,
    customerId: string,
    plannedStart: Date,
    plannedEnd: Date,
  ): Promise<string> {
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: plannedStart.toISOString(),
        plannedEnd: plannedEnd.toISOString(),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
    return created.body.id as string;
  }

  it("activation correctly allows/denies based on the real instant, independently for Warsaw and New York tenants", async () => {
    const warsaw = await registerTenant(
      "owner-warsaw-act@example.com",
      "Warsaw Act Co",
      "Europe/Warsaw",
    );
    const warsawAssets = await setupCustomerAndAsset(warsaw.tenantId, warsaw.cookie);
    const newYork = await registerTenant(
      "owner-ny-act@example.com",
      "New York Act Co",
      "America/New_York",
    );
    const newYorkAssets = await setupCustomerAndAsset(newYork.tenantId, newYork.cookie);

    const HOUR_MS = 60 * 60 * 1000;

    // Future start — allowed on both tenants.
    const warsawFuture = await createAndReserve(
      warsaw.tenantId,
      warsaw.cookie,
      warsawAssets.assetId,
      warsawAssets.customerId,
      new Date(Date.now() + HOUR_MS),
      new Date(Date.now() + 3 * HOUR_MS),
    );
    await request(app.getHttpServer())
      .post(`/tenants/${warsaw.tenantId}/rentals/${warsawFuture}/start`)
      .set("Cookie", warsaw.cookie)
      .send({})
      .expect(201);

    const newYorkFuture = await createAndReserve(
      newYork.tenantId,
      newYork.cookie,
      newYorkAssets.assetId,
      newYorkAssets.customerId,
      new Date(Date.now() + HOUR_MS),
      new Date(Date.now() + 3 * HOUR_MS),
    );
    await request(app.getHttpServer())
      .post(`/tenants/${newYork.tenantId}/rentals/${newYorkFuture}/start`)
      .set("Cookie", newYork.cookie)
      .send({})
      .expect(201);

    // Past start — denied on both tenants, independently. Uses each
    // tenant's second asset — the first is already ACTIVE for an
    // overlapping window from the future-start case above.
    const warsawPast = await createAndReserve(
      warsaw.tenantId,
      warsaw.cookie,
      warsawAssets.secondAssetId,
      warsawAssets.customerId,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() + HOUR_MS),
    );
    const warsawPastResponse = await request(app.getHttpServer())
      .post(`/tenants/${warsaw.tenantId}/rentals/${warsawPast}/start`)
      .set("Cookie", warsaw.cookie)
      .send({})
      .expect(409);
    expect(warsawPastResponse.body.message).toBe(
      "Cannot activate a rental whose planned start date/time has already passed.",
    );

    const newYorkPast = await createAndReserve(
      newYork.tenantId,
      newYork.cookie,
      newYorkAssets.secondAssetId,
      newYorkAssets.customerId,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() + HOUR_MS),
    );
    await request(app.getHttpServer())
      .post(`/tenants/${newYork.tenantId}/rentals/${newYorkPast}/start`)
      .set("Cookie", newYork.cookie)
      .send({})
      .expect(409);
  });

  // ---------------------------------------------------------------------
  // Availability overlap — correct using real converted instants
  // ---------------------------------------------------------------------

  it("availability overlap is correctly enforced using tenant-local-derived real instants (Warsaw)", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-warsaw-overlap@example.com",
      "Warsaw Overlap Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);

    const firstStart = tenantLocalToUtc("2026-09-10T09:00", "Europe/Warsaw").toISOString();
    const firstEnd = tenantLocalToUtc("2026-09-12T09:00", "Europe/Warsaw").toISOString();
    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: firstStart,
        plannedEnd: firstEnd,
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${first.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    // Overlapping window (same tenant-local wall clock reasoning, real
    // instants under the hood) — must be rejected.
    const overlappingStart = tenantLocalToUtc("2026-09-11T09:00", "Europe/Warsaw").toISOString();
    const overlappingEnd = tenantLocalToUtc("2026-09-13T09:00", "Europe/Warsaw").toISOString();
    const overlapping = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: overlappingStart,
        plannedEnd: overlappingEnd,
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${overlapping.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(409);

    // A window starting exactly when the first ends — half-open interval,
    // must be allowed (same-day turnover).
    const backToBackStart = firstEnd;
    const backToBackEnd = tenantLocalToUtc("2026-09-14T09:00", "Europe/Warsaw").toISOString();
    const backToBack = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: backToBackStart,
        plannedEnd: backToBackEnd,
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${backToBack.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
  });

  // ---------------------------------------------------------------------
  // Overdue return boundary — correct for a non-UTC tenant
  // ---------------------------------------------------------------------

  it("overdue-return boundary is correct for a Warsaw tenant regardless of server timezone", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-warsaw-overdue@example.com",
      "Warsaw Overdue Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);
    const HOUR_MS = 60 * 60 * 1000;

    // Create with a safely-near-future start, start for real (so the real
    // side effects fire), then backdate plannedEnd to just before "now" —
    // mirrors the established technique from D-113 for simulating an
    // overdue rental without ever passing start() an already-past date.
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: new Date(Date.now() + 5000).toISOString(),
        plannedEnd: new Date(Date.now() + HOUR_MS).toISOString(),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
    // Start immediately, while plannedStart is still current/future — the
    // activation rule (D-113) only rejects an already-*past* plannedStart;
    // it must never be triggered here. Only plannedEnd gets backdated
    // below, to simulate an overdue return.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${created.body.id}/start`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    await prisma.rental.update({
      where: { id: created.body.id as string },
      data: { plannedEnd: new Date(Date.now() - 60_000) },
    });

    // Now-overdue asset must block a future reservation attempt.
    const conflicting = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
        plannedEnd: new Date(Date.now() + 48 * HOUR_MS).toISOString(),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${conflicting.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(409);
  }, 15000);

  // ---------------------------------------------------------------------
  // Maintenance block — correct using real converted instants
  // ---------------------------------------------------------------------

  it("a maintenance block created from a tenant-local reading correctly blocks an overlapping rental", async () => {
    const { tenantId, cookie } = await registerTenant(
      "owner-warsaw-block@example.com",
      "Warsaw Block Co",
      "Europe/Warsaw",
    );
    const { assetId, customerId } = await setupCustomerAndAsset(tenantId, cookie);

    const blockStart = tenantLocalToUtc("2026-09-20T08:00", "Europe/Warsaw").toISOString();
    const blockEnd = tenantLocalToUtc("2026-09-22T18:00", "Europe/Warsaw").toISOString();
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${assetId}/availability-blocks`)
      .set("Cookie", cookie)
      .send({ type: "MAINTENANCE", startAt: blockStart, endAt: blockEnd })
      .expect(201);

    const overlappingStart = tenantLocalToUtc("2026-09-21T09:00", "Europe/Warsaw").toISOString();
    const overlappingEnd = tenantLocalToUtc("2026-09-23T09:00", "Europe/Warsaw").toISOString();
    const rental = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId,
        plannedStart: overlappingStart,
        plannedEnd: overlappingEnd,
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 1000 }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals/${rental.body.id}/reserve`)
      .set("Cookie", cookie)
      .send({})
      .expect(409);
  });
});
