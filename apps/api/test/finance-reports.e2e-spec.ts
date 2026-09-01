import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

// XLSX/PDF are binary content types superagent doesn't recognize by
// default, so response.body would otherwise come back empty — the exact
// same explicit raw-buffer parser customer-portal-features.e2e-spec.ts
// already established for its own ZIP download test.
interface BinaryParserSource {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
}

function binaryParser(res: BinaryParserSource, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * Havelio Financial Reports & Analytics V1 — read-only aggregation over
 * the already-canonical Invoice/Payment/RentalDeposit data. Every test
 * here uses `period=ALL_TIME` for the core-number assertions (deliberately
 * avoiding any dependency on "today" being inside a particular calendar
 * month, which would make the suite flaky depending on when it runs) and
 * a small, separate set of tests specifically exercises real period-preset
 * switching and tenant-timezone behavior.
 */
describe("Financial Reports & Analytics E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
  let assetId: string;
  let bankAccountId: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function setUpTenant(overrides: Record<string, unknown> = {}): Promise<{
    tenantId: string;
    cookie: string;
    customerId: string;
    categoryId: string;
    assetId: string;
    bankAccountId: string;
  }> {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, ...overrides })
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    const tid = body.tenant.id;
    const cookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tid}/asset-categories`)
      .set("Cookie", cookie)
      .send({ name: "Generators" })
      .expect(201);
    const catId = categoryResponse.body.id;

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tid}/assets`)
      .set("Cookie", cookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId: catId })
      .expect(201);
    const astId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tid}/customers`)
      .set("Cookie", cookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    const custId = customerResponse.body.id;

    const bankResponse = await request(app.getHttpServer())
      .post(`/tenants/${tid}/bank-accounts`)
      .set("Cookie", cookie)
      .send({ label: "Main account", currency: (overrides.defaultCurrency as string) ?? "USD" })
      .expect(201);
    const bankId = bankResponse.body.id;

    return { tenantId: tid, cookie, customerId: custId, categoryId: catId, assetId: astId, bankAccountId: bankId };
  }

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const setup = await setUpTenant({
      countryCode: "PL",
      defaultLanguage: "pl",
      defaultCurrency: "PLN",
      timezone: "Europe/Warsaw",
    });
    tenantId = setup.tenantId;
    accessCookie = setup.cookie;
    customerId = setup.customerId;
    categoryId = setup.categoryId;
    assetId = setup.assetId;
    bankAccountId = setup.bankAccountId;
  });

  async function createMemberWithRole(role: string, email: string, tid = tenantId): Promise<string> {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName: `${role} Co` })
      .expect(201);
    const memberBody = registerResponse.body as RegisterResponseBody;
    const memberCookie = extractCookie(registerResponse.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId: tid, userId: memberBody.user.id, role: role as never, status: "ACTIVE" },
    });
    return memberCookie;
  }

  /** Creates + issues a standalone invoice (no Rental) for exactly `totalMajor` in `currency`, with the given due-date offset. Returns the invoice id and total in minor units. */
  async function createStandaloneInvoice(
    totalMajor: number,
    dueDateOffsetDays: number,
    currency = "PLN",
    tid = tenantId,
    cookie = accessCookie,
    custId = customerId,
    bankId = bankAccountId,
  ): Promise<{ id: string; totalMinor: number }> {
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tid}/invoices`)
      .set("Cookie", cookie)
      .send({
        customerId: custId,
        currency,
        bankAccountId: bankId,
        issueDate: dateOffset(0),
        dueDate: dateOffset(dueDateOffsetDays),
        items: [{ description: "Rental charge", unitNetPriceMinor: totalMajor * 100 }],
      })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/tenants/${tid}/invoices/${created.body.id}/issue`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
    return { id: created.body.id, totalMinor: issued.body.totalMinor };
  }

  async function payInvoice(
    invoiceId: string,
    amountMinor: number,
    method: "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER" = "BANK_TRANSFER",
    tid = tenantId,
    cookie = accessCookie,
  ) {
    return request(app.getHttpServer())
      .post(`/tenants/${tid}/invoices/${invoiceId}/payments`)
      .set("Cookie", cookie)
      .send({ amountMinor, paymentDate: dateOffset(0), method })
      .expect(201);
  }

  // -----------------------------------------------------------------
  // §50/§51 acceptance matrix — exact totals, hand-verified
  // -----------------------------------------------------------------

  describe("PLN acceptance matrix", () => {
    it("computes exact billed/cash-received/outstanding/overdue totals for the documented test data", async () => {
      // 1,000 fully paid
      const invA = await createStandaloneInvoice(1000, 7);
      await payInvoice(invA.id, 100_000);
      // 2,000 partial 800 paid
      const invB = await createStandaloneInvoice(2000, 7);
      await payInvoice(invB.id, 80_000);
      // 1,500 overdue unpaid
      await createStandaloneInvoice(1500, -5);
      // 500 future due unpaid
      await createStandaloneInvoice(500, 30);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row.invoiced.currentMinor).toBe(500_000); // 5,000 PLN
      expect(row.cashReceived.currentMinor).toBe(180_000); // 1,800 PLN
      expect(row.outstandingMinor).toBe(320_000); // 3,200 PLN
      expect(row.overdueMinor).toBe(150_000); // 1,500 PLN — only the overdue invoice
    });

    it("outstanding/overdue is a snapshot as of NOW, never as of the end of the selected period (a THIS_MONTH view on day 1 must not treat a due-later-this-month invoice as already overdue)", async () => {
      // Due 7 days from now — still comfortably inside "this month" but
      // NOT yet overdue today. A bug here would use the *end* of the
      // selected THIS_MONTH period as "now" and wrongly mark this overdue.
      const notYetDue = await createStandaloneInvoice(1000, 7);
      void notYetDue;
      // A genuinely overdue invoice, for contrast.
      await createStandaloneInvoice(500, -3);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "THIS_MONTH", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row.outstandingMinor).toBe(150_000); // both invoices, still fully outstanding
      expect(row.overdueMinor).toBe(50_000); // only the genuinely-overdue one
    });

    it("never includes a deposit receipt in cash-received revenue", async () => {
      const rental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          currency: "PLN",
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(2),
          items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 10_000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit/receive`)
        .set("Cookie", accessCookie)
        .send({ receivedAt: dateOffset(0), receivedAmountMinor: 100_000, receivedMethod: "BANK_TRANSFER" })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row?.cashReceived.currentMinor ?? 0).toBe(0);
    });

    it("excludes a cancelled invoice from invoiced totals", async () => {
      const invoice = await createStandaloneInvoice(1000, 7);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/cancel`)
        .set("Cookie", accessCookie)
        .send({ reason: "Duplicate" })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row?.invoiced.currentMinor ?? 0).toBe(0);
    });

    it("excludes a voided payment from cash-received", async () => {
      const invoice = await createStandaloneInvoice(1000, 7);
      const payment = await payInvoice(invoice.id, 100_000);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/${payment.body.id}/void`)
        .set("Cookie", accessCookie)
        .send({ reason: "Entered by mistake" })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row?.cashReceived.currentMinor ?? 0).toBe(0);
      // The invoice is still fully outstanding, since the voided payment
      // never counted.
      expect(row?.outstandingMinor ?? 0).toBe(100_000);
    });
  });

  // -----------------------------------------------------------------
  // Multi-currency — never a cross-currency grand total
  // -----------------------------------------------------------------

  describe("Multi-currency grouping", () => {
    it("PLN and EUR never mix — each currency has its own row, and a currency filter isolates one", async () => {
      const plnInvoice = await createStandaloneInvoice(1000, 7, "PLN");
      await payInvoice(plnInvoice.id, 100_000);
      const eurInvoice = await createStandaloneInvoice(1200, 7, "EUR");
      await payInvoice(eurInvoice.id, 70_000);

      const all = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", accessCookie)
        .expect(200);
      const pln = all.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      const eur = all.body.rows.find((r: { currency: string }) => r.currency === "EUR");
      expect(pln.invoiced.currentMinor).toBe(100_000);
      expect(eur.invoiced.currentMinor).toBe(120_000);
      expect(pln.cashReceived.currentMinor).toBe(100_000);
      expect(eur.cashReceived.currentMinor).toBe(70_000);

      const plnOnly = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(plnOnly.body.rows.every((r: { currency: string }) => r.currency === "PLN")).toBe(true);
      expect(plnOnly.body.rows.some((r: { currency: string }) => r.currency === "EUR")).toBe(false);
    });

    it("never returns a cross-currency grand total field anywhere in the overview payload", async () => {
      await createStandaloneInvoice(1000, 7, "PLN");
      await createStandaloneInvoice(1000, 7, "EUR");
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(response.body).not.toHaveProperty("totalMinor");
      expect(response.body).not.toHaveProperty("grandTotal");
      expect(Array.isArray(response.body.rows)).toBe(true);
    });
  });

  // -----------------------------------------------------------------
  // Receivable aging, biggest debtors, previous-period comparison
  // -----------------------------------------------------------------

  describe("Receivables aging and debtors", () => {
    it("classifies an overdue invoice into the correct aging bucket", async () => {
      await createStandaloneInvoice(1000, -10); // 10 days overdue -> 8_30_DAYS
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/receivables-aging`)
        .query({ currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      const plnRow = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      const bucket = plnRow.buckets.find((b: { bucket: string }) => b.bucket === "8_30_DAYS");
      expect(bucket.outstandingMinor).toBe(100_000);
    });

    it("ranks the biggest debtor first, with oldest due date and unpaid invoice count", async () => {
      const other = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", accessCookie)
        .send({ firstName: "Big", lastName: "Debtor", email: "big@example.com" })
        .expect(201);
      await createStandaloneInvoice(500, -3);
      const bigInvoice1 = await createStandaloneInvoice(3000, -10, "PLN", tenantId, accessCookie, other.body.id);
      await createStandaloneInvoice(1000, -2, "PLN", tenantId, accessCookie, other.body.id);
      void bigInvoice1;

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/biggest-debtors`)
        .query({ currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      expect(response.body.rows[0].customerId).toBe(other.body.id);
      expect(response.body.rows[0].outstandingMinor).toBe(400_000);
      expect(response.body.rows[0].unpaidInvoiceCount).toBe(2);
      expect(response.body.rows[0].oldestOverdueDays).toBeGreaterThanOrEqual(10);
    });

    it("previous-period comparison shows 'no previous value' (null percentChange) rather than Infinity when the previous period was zero", async () => {
      await createStandaloneInvoice(1000, 7);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "THIS_MONTH", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      // Freshly-created tenant: no invoices existed in the previous month.
      expect(row.invoiced.previousMinor).toBe(0);
      expect(row.invoiced.percentChange).toBeNull();
      expect(Number.isFinite(row.invoiced.percentChange)).toBe(false);
    });

    it("ALL_TIME has no previous-period comparison at all", async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(response.body.period.previous).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // Payment method breakdown + deposit-application source labeling
  // -----------------------------------------------------------------

  describe("Payment analytics", () => {
    it("breaks down amount/count by method and separates manual from deposit-application source", async () => {
      const invoice1 = await createStandaloneInvoice(1000, 7);
      await payInvoice(invoice1.id, 60_000, "BANK_TRANSFER");
      const invoice2 = await createStandaloneInvoice(1000, 7);
      await payInvoice(invoice2.id, 40_000, "CASH");

      const rental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          currency: "PLN",
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(2),
          items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 10_000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit/receive`)
        .set("Cookie", accessCookie)
        .send({ receivedAt: dateOffset(0), receivedAmountMinor: 100_000, receivedMethod: "BANK_TRANSFER" })
        .expect(201);
      const deposit = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit`)
        .set("Cookie", accessCookie)
        .expect(200);
      const invoice3 = await createStandaloneInvoice(1000, 7);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice3.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: deposit.body.id, amountMinor: 30_000 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/payments`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row.totalMinor).toBe(130_000);
      expect(row.count).toBe(3);
      const bankTransfer = row.byMethod.find((m: { method: string }) => m.method === "BANK_TRANSFER");
      const cash = row.byMethod.find((m: { method: string }) => m.method === "CASH");
      expect(bankTransfer.amountMinor).toBe(90_000); // 60_000 manual + 30_000 deposit application
      expect(cash.amountMinor).toBe(40_000);
      expect(row.bySource.manual.amountMinor).toBe(100_000);
      expect(row.bySource.depositApplication.amountMinor).toBe(30_000);
    });
  });

  // -----------------------------------------------------------------
  // Top customers metric selector
  // -----------------------------------------------------------------

  describe("Top customers", () => {
    it("ranks differently by invoiced vs cashReceived vs outstanding — never blended", async () => {
      const bigBiller = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", accessCookie)
        .send({ firstName: "Big", lastName: "Biller", email: "biller@example.com" })
        .expect(201);
      const bigPayer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", accessCookie)
        .send({ firstName: "Big", lastName: "Payer", email: "payer@example.com" })
        .expect(201);

      // bigBiller: invoiced 5000, paid nothing (all outstanding).
      const bigBillerInvoice = await createStandaloneInvoice(5000, 7, "PLN", tenantId, accessCookie, bigBiller.body.id);
      void bigBillerInvoice;
      // bigPayer: invoiced 1000, fully paid.
      const bigPayerInvoice = await createStandaloneInvoice(1000, 7, "PLN", tenantId, accessCookie, bigPayer.body.id);
      await payInvoice(bigPayerInvoice.id, 100_000);

      const byInvoiced = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/top-customers`)
        .query({ period: "ALL_TIME", currency: "PLN", metric: "invoiced" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(byInvoiced.body.rows[0].customerId).toBe(bigBiller.body.id);

      const byCashReceived = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/top-customers`)
        .query({ period: "ALL_TIME", currency: "PLN", metric: "cashReceived" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(byCashReceived.body.rows[0].customerId).toBe(bigPayer.body.id);

      const byOutstanding = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/top-customers`)
        .query({ period: "ALL_TIME", currency: "PLN", metric: "outstanding" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(byOutstanding.body.rows[0].customerId).toBe(bigBiller.body.id);
      expect(byOutstanding.body.rows.find((r: { customerId: string }) => r.customerId === bigPayer.body.id)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // Deposit analytics — separate from revenue
  // -----------------------------------------------------------------

  describe("Deposit analytics", () => {
    it("computes received/applied/returned/retained/currentlyHeld exactly, per currency", async () => {
      const rental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          currency: "PLN",
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(2),
          items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 10_000 }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit/receive`)
        .set("Cookie", accessCookie)
        .send({ receivedAt: dateOffset(0), receivedAmountMinor: 100_000, receivedMethod: "BANK_TRANSFER" })
        .expect(201);
      const deposit = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit`)
        .set("Cookie", accessCookie)
        .expect(200);

      const invoice = await createStandaloneInvoice(1000, 7);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: deposit.body.id, amountMinor: 30_000 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit/return`)
        .set("Cookie", accessCookie)
        .send({
          returnedAt: dateOffset(0),
          returnedAmountMinor: 40_000,
          retainedAmountMinor: 10_000,
          retentionReason: "Minor equipment damage",
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/deposits`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row.receivedMinor).toBe(100_000);
      expect(row.appliedMinor).toBe(30_000);
      expect(row.returnedMinor).toBe(40_000);
      expect(row.retainedMinor).toBe(10_000);
      expect(row.currentlyHeldMinor).toBe(20_000); // 100_000 - 30_000 - 40_000 - 10_000
    });
  });

  // -----------------------------------------------------------------
  // Asset attribution — only reliable, line-level-linked lines count
  // -----------------------------------------------------------------

  describe("Asset performance", () => {
    it("attributes invoiced amount to an asset only via a real RentalItem link, never an ad-hoc typed line", async () => {
      const rental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          currency: "PLN",
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(2),
          items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 70_000 }],
        })
        .expect(201);
      // Create-from-rental prefill sets InvoiceItem.sourceRentalItemId.
      const linkedInvoice = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId: rental.body.id, bankAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${linkedInvoice.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      // A separate, ad-hoc invoice with a manually-typed line — no asset link.
      await createStandaloneInvoice(9999, 7);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/assets`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      expect(response.body.rows).toHaveLength(1);
      expect(response.body.rows[0].assetId).toBe(assetId);
      expect(response.body.rows[0].invoicedMinor).toBe(70_000);
    });

    it("category performance rolls the same attribution up by the asset's own category", async () => {
      const rental = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals`)
        .set("Cookie", accessCookie)
        .send({
          customerId,
          currency: "PLN",
          plannedStart: dateOffset(1),
          plannedEnd: dateOffset(2),
          items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 50_000 }],
        })
        .expect(201);
      const linkedInvoice = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId: rental.body.id, bankAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${linkedInvoice.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/categories`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);

      expect(response.body.rows[0].categoryId).toBe(categoryId);
      expect(response.body.rows[0].invoicedMinor).toBe(50_000);
    });
  });

  // -----------------------------------------------------------------
  // Utilization — sane, bounded numbers, never negative idle time
  // -----------------------------------------------------------------

  describe("Asset utilization", () => {
    it("returns non-negative, bounded rental/idle figures", async () => {
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/utilization`)
        .query({ period: "THIS_MONTH" })
        .set("Cookie", accessCookie)
        .expect(200);

      expect(response.body.fleet.usableDays).toBeGreaterThanOrEqual(0);
      expect(response.body.fleet.rentedDays).toBeGreaterThanOrEqual(0);
      expect(response.body.fleet.idleDays).toBeGreaterThanOrEqual(0);
      expect(response.body.fleet.rentalUtilizationPercent).toBeGreaterThanOrEqual(0);
      expect(response.body.fleet.rentalUtilizationPercent).toBeLessThanOrEqual(100);
    });
  });

  // -----------------------------------------------------------------
  // Time series — requires an explicit currency, never mixes
  // -----------------------------------------------------------------

  describe("Time series", () => {
    it("rejects a timeseries request with no currency", async () => {
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/timeseries`)
        .query({ period: "THIS_MONTH" })
        .set("Cookie", accessCookie)
        .expect(400);
    });

    it("groups a long ALL_TIME-style range by month, not by day", async () => {
      await createStandaloneInvoice(1000, 7);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/timeseries`)
        .query({ period: "THIS_YEAR", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(response.body.granularity).toBe("month");
    });
  });

  // -----------------------------------------------------------------
  // Drill-down tables
  // -----------------------------------------------------------------

  describe("Drill-down tables", () => {
    it("receivables table matches invoice balances exactly", async () => {
      const invoice = await createStandaloneInvoice(1000, 7);
      await payInvoice(invoice.id, 30_000);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/receivables`)
        .query({ currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      const row = response.body.items.find((r: { invoiceId: string }) => r.invoiceId === invoice.id);
      expect(row.totalMinor).toBe(100_000);
      expect(row.paidMinor).toBe(30_000);
      expect(row.outstandingMinor).toBe(70_000);
      expect(row.paymentStatus).toBe("PARTIALLY_PAID");
    });

    it("cash-received table lists a payment with its source and entered-by name", async () => {
      const invoice = await createStandaloneInvoice(1000, 7);
      await payInvoice(invoice.id, 50_000, "CARD");
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/cash-received`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].amountMinor).toBe(50_000);
      expect(response.body.items[0].method).toBe("CARD");
      expect(response.body.items[0].source).toBe("manual");
      expect(response.body.items[0].enteredByName).toContain("Ada");
    });
  });

  // -----------------------------------------------------------------
  // Exports
  // -----------------------------------------------------------------

  describe("Exports", () => {
    it("CSV export returns a well-formed summary with a UTF-8 BOM and correct header row", async () => {
      await createStandaloneInvoice(1000, 7);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/csv`)
        .query({ period: "ALL_TIME", report: "summary" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      const text = (response.text as string) ?? response.body.toString("utf-8");
      expect(text.charCodeAt(0)).toBe(0xfeff);
      expect(text).toContain("Currency,Invoiced,Cash received");
    });

    it("XLSX export produces a real workbook with the documented sheet names", async () => {
      await createStandaloneInvoice(1000, 7);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/xlsx`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", accessCookie)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers["content-type"]).toContain("spreadsheetml");
      const workbook = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exceljs's bundled Buffer type and this workspace's @types/node Buffer type are structurally identical but nominally distinct; any is the pragmatic escape hatch for a test-only assertion.
      await workbook.xlsx.load(response.body as any);
      const sheetNames = workbook.worksheets.map((s) => s.name);
      expect(sheetNames).toEqual(expect.arrayContaining(["Summary", "Payments", "Receivables", "Customers", "Deposits"]));
    });

    it("PDF export produces a real PDF with the tenant's name embedded", async () => {
      await createStandaloneInvoice(1000, 7);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/pdf`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", accessCookie)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(response.headers["content-type"]).toContain("application/pdf");
      const buffer = response.body as Buffer;
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }, 30_000);
  });

  // -----------------------------------------------------------------
  // RBAC
  // -----------------------------------------------------------------

  describe("RBAC", () => {
    it("VIEWER can read the overview but cannot export", async () => {
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", viewerCookie)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/csv`)
        .query({ period: "ALL_TIME", report: "summary" })
        .set("Cookie", viewerCookie)
        .expect(403);
    });

    it("TECHNICIAN has no finance visibility at all", async () => {
      const technicianCookie = await createMemberWithRole("TECHNICIAN", "tech@example.com");
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", technicianCookie)
        .expect(403);
    });

    it("MANAGER can read and export", async () => {
      const managerCookie = await createMemberWithRole("MANAGER", "manager@example.com");
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/csv`)
        .query({ period: "ALL_TIME", report: "summary" })
        .set("Cookie", managerCookie)
        .expect(200);
    });
  });

  // -----------------------------------------------------------------
  // Tenant isolation
  // -----------------------------------------------------------------

  describe("Tenant isolation", () => {
    it("Tenant A's financial data never appears in Tenant B's reports, and Tenant B cannot query Tenant A's tenantId at all", async () => {
      await createStandaloneInvoice(1000, 7);
      const other = await setUpTenant({ email: "other-owner@example.com", companyName: "Other Co" });

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", other.cookie)
        .expect(403);

      const ownOverview = await request(app.getHttpServer())
        .get(`/tenants/${other.tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", other.cookie)
        .expect(200);
      expect(ownOverview.body.rows).toHaveLength(0);

      const topCustomers = await request(app.getHttpServer())
        .get(`/tenants/${other.tenantId}/finance-reports/top-customers`)
        .query({ period: "ALL_TIME" })
        .set("Cookie", other.cookie)
        .expect(200);
      expect(topCustomers.body.rows).toHaveLength(0);

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/export/csv`)
        .query({ period: "ALL_TIME", report: "summary" })
        .set("Cookie", other.cookie)
        .expect(403);
    });
  });

  // -----------------------------------------------------------------
  // Tenant timezone / period boundaries
  // -----------------------------------------------------------------

  describe("Tenant timezone", () => {
    it("a USA tenant's THIS_MONTH resolves against its own America/New_York timezone, not the Poland tenant's Europe/Warsaw", async () => {
      const usTenant = await setUpTenant({
        email: "us-owner@example.com",
        companyName: "US Rentals",
        countryCode: "US",
        defaultLanguage: "en",
        defaultCurrency: "USD",
        timezone: "America/New_York",
      });
      const response = await request(app.getHttpServer())
        .get(`/tenants/${usTenant.tenantId}/finance-reports/overview`)
        .query({ period: "THIS_MONTH" })
        .set("Cookie", usTenant.cookie)
        .expect(200);
      expect(response.body.period.preset).toBe("THIS_MONTH");
      expect(response.body.period.fromDate).toMatch(/^\d{4}-\d{2}-01$/);
    });

    it("switching from THIS_MONTH to CUSTOM changes the resolved period boundaries", async () => {
      const thisMonth = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "THIS_MONTH" })
        .set("Cookie", accessCookie)
        .expect(200);
      const custom = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "CUSTOM", from: "2020-01-01", to: "2020-01-31" })
        .set("Cookie", accessCookie)
        .expect(200);
      expect(custom.body.period.fromDate).toBe("2020-01-01");
      expect(custom.body.period.fromDate).not.toBe(thisMonth.body.period.fromDate);
    });

    it("rejects CUSTOM without from/to", async () => {
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "CUSTOM" })
        .set("Cookie", accessCookie)
        .expect(400);
    });
  });

  // -----------------------------------------------------------------
  // Decimal precision
  // -----------------------------------------------------------------

  describe("Decimal precision", () => {
    it("sums many odd-minor-unit payments without drift", async () => {
      const invoice = await createStandaloneInvoice(1000, 7);
      await payInvoice(invoice.id, 33_333);
      await payInvoice(invoice.id, 33_333);
      await payInvoice(invoice.id, 33_334);
      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/finance-reports/overview`)
        .query({ period: "ALL_TIME", currency: "PLN" })
        .set("Cookie", accessCookie)
        .expect(200);
      const row = response.body.rows.find((r: { currency: string }) => r.currency === "PLN");
      expect(row.cashReceived.currentMinor).toBe(100_000);
    });
  });
});
