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

describe("Invoices E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let categoryId: string;
  let assetId: string;
  let bankAccountId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  function dateOffset(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, countryCode: "PL" })
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

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", accessCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;

    const bankResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/bank-accounts`)
      .set("Cookie", accessCookie)
      .send({ label: "PLN account", currency: "PLN", iban: "PL00000000000000000000000000" })
      .expect(201);
    bankAccountId = bankResponse.body.id;
  });

  async function createRental(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", accessCookie)
      .send({
        customerId,
        currency: "PLN",
        plannedStart: dateOffset(0),
        plannedEnd: dateOffset(1),
        items: [{ assetId, billingMode: "DAILY", dailyPriceMinor: 80_000, taxRateBp: 2300 }], // 23% of 80000 minor units (800.00 PLN) = 18_400
        ...overrides,
      })
      .expect(201);
  }

  // -----------------------------------------------------------------------
  // Bank accounts
  // -----------------------------------------------------------------------

  it("the first bank account created for a tenant becomes the default automatically", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/bank-accounts`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: bankAccountId, isDefault: true, isActive: true });
  });

  it("setting a new default bank account unsets the previous one", async () => {
    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/bank-accounts`)
      .set("Cookie", accessCookie)
      .send({ label: "EUR account", currency: "EUR", isDefault: true })
      .expect(201);
    expect(second.body.isDefault).toBe(true);

    const first = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/bank-accounts/${bankAccountId}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(first.body.isDefault).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Create from Rental — prefill
  // -----------------------------------------------------------------------

  it("creates a DRAFT invoice from a Rental, prefilling customer/currency/bank account/items/tax", async () => {
    const rental = await createRental();

    const invoiceResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);

    expect(invoiceResponse.body).toMatchObject({
      status: "DRAFT",
      customerId,
      rentalId: rental.body.id,
      currency: "PLN",
      bankAccountId,
      subtotalMinor: 80_000,
      taxMinor: 18_400,
      totalMinor: 98_400,
      documentLanguage: "pl",
    });
    expect(invoiceResponse.body.invoiceNumber).toMatch(/^DRAFT-/);
    expect(invoiceResponse.body.items).toHaveLength(1);
    expect(invoiceResponse.body.items[0]).toMatchObject({
      description: "Generator A",
      unitNetPriceMinor: 80_000,
      taxRateBp: 2300,
      netTotalMinor: 80_000,
      taxTotalMinor: 18_400,
      grossTotalMinor: 98_400,
    });
    expect(invoiceResponse.body.bankSnapshot).toMatchObject({
      iban: "PL00000000000000000000000000",
    });
  });

  // -----------------------------------------------------------------------
  // Direct-print preview — backs the invoice detail page's Print button
  // (see DECISIONS.md D-107); same HTML the PDF is rendered from, without
  // invoking Puppeteer.
  // -----------------------------------------------------------------------

  it("returns the same renderable HTML the PDF is built from via GET /:id/preview", async () => {
    const rental = await createRental();
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);

    const preview = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${created.body.id}/preview`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(preview.body.html).toContain("Generator A");
    expect(preview.body.html).toContain(created.body.invoiceNumber);
  });

  // -----------------------------------------------------------------------
  // Issue — numbering + snapshot freeze + immutability
  // -----------------------------------------------------------------------

  it("issuing an invoice assigns a real sequential number and freezes editing", async () => {
    const rental = await createRental();
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);

    const issued = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    expect(issued.body.status).toBe("ISSUED");
    expect(issued.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{2}-\d{6}$/);

    // An issued invoice is no longer a DRAFT — editing it must be rejected.
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/invoices/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ notes: "should be rejected" })
      .expect(409);
  });

  it("a Company Profile edit after issuing never changes the already-issued invoice's snapshot", async () => {
    const rental = await createRental();
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    const originalSellerName = issued.body.sellerSnapshot.name;

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({
        name: "Renamed Company Ltd",
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
      })
      .expect(200);

    const refetched = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(refetched.body.sellerSnapshot.name).toBe(originalSellerName);
    expect(refetched.body.sellerSnapshot.name).not.toBe("Renamed Company Ltd");
  });

  // -----------------------------------------------------------------------
  // Payments — exact integer-money arithmetic
  // -----------------------------------------------------------------------

  it("recording a partial then final payment derives PARTIALLY_PAID then PAID with exact remaining amounts", async () => {
    const rental = await createRental({
      items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 100_000 }],
    });
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(issued.body.totalMinor).toBe(100_000);

    const partial = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments`)
      .set("Cookie", accessCookie)
      .send({ amountMinor: 40_000, paymentDate: dateOffset(0) })
      .expect(201);
    expect(partial.body.amountMinor).toBe(40_000);

    const afterPartial = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(afterPartial.body).toMatchObject({
      status: "PARTIALLY_PAID",
      paidMinor: 40_000,
      remainingMinor: 60_000,
    });

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments`)
      .set("Cookie", accessCookie)
      .send({ amountMinor: 60_000, paymentDate: dateOffset(0) })
      .expect(201);

    const afterFull = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(afterFull.body).toMatchObject({ status: "PAID", paidMinor: 100_000, remainingMinor: 0 });
  });

  // -----------------------------------------------------------------------
  // Multiple invoices per Rental
  // -----------------------------------------------------------------------

  it("supports multiple independently-accessible invoices for the same Rental", async () => {
    const rental = await createRental();

    const first = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({
        rentalId: rental.body.id,
        customerId,
        items: [{ description: "Late fee", unitNetPriceMinor: 5_000, taxRateBp: 2300 }],
      })
      .expect(201);

    expect(first.body.id).not.toBe(second.body.id);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .query({ rentalId: rental.body.id })
      .expect(200);
    expect(list.body.total).toBe(2);
    const ids = list.body.data.map((invoice: { id: string }) => invoice.id);
    expect(ids).toContain(first.body.id);
    expect(ids).toContain(second.body.id);

    // Both remain independently fetchable and issuable.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${first.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${second.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const firstAfter = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${first.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    const secondAfter = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${second.body.id}`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(firstAfter.body.invoiceNumber).not.toBe(secondAfter.body.invoiceNumber);
  });

  // -----------------------------------------------------------------------
  // Cancel
  // -----------------------------------------------------------------------

  it("cannot cancel a PAID invoice, but can cancel an ISSUED one", async () => {
    const rental = await createRental({
      items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 10_000 }],
    });
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: rental.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments`)
      .set("Cookie", accessCookie)
      .send({ amountMinor: 10_000, paymentDate: dateOffset(0) })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${created.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(409);

    const secondRental = await createRental({
      items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 10_000 }],
    });
    const secondInvoice = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", accessCookie)
      .send({ rentalId: secondRental.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${secondInvoice.body.id}/issue`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${secondInvoice.body.id}/cancel`)
      .set("Cookie", accessCookie)
      .send({})
      .expect(201);
    expect(cancelled.body.status).toBe("CANCELLED");
  });
});
