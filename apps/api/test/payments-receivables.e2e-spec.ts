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

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function tokenFromInviteLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1]!;
}

/**
 * Havelio Payments & Receivables — the payment ledger (mark-as-paid,
 * partial payments, void, overpayment/currency protection, concurrency
 * safety), deposit application, derived payment status, receivable aging/
 * financial-summary foundation, and the international Payment Demand
 * system (Poland's "Wezwanie do zapłaty" as the first country template,
 * a safe generic fallback for every other country).
 */
describe("Payments & Receivables E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let customerId: string;
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

    return {
      tenantId: tid,
      cookie,
      customerId: custId,
      categoryId: catId,
      assetId: astId,
      bankAccountId: bankId,
    };
  }

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const setup = await setUpTenant();
    tenantId = setup.tenantId;
    accessCookie = setup.cookie;
    customerId = setup.customerId;
    assetId = setup.assetId;
    bankAccountId = setup.bankAccountId;
  });

  async function createMemberWithRole(
    role: string,
    email: string,
    tid = tenantId,
  ): Promise<string> {
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

  async function createRental(
    tid = tenantId,
    cookie = accessCookie,
    custId = customerId,
    astId = assetId,
    dailyPriceMinor = 100_000,
    currency = "USD",
  ) {
    return request(app.getHttpServer())
      .post(`/tenants/${tid}/rentals`)
      .set("Cookie", cookie)
      .send({
        customerId: custId,
        currency,
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(2),
        items: [{ assetId: astId, billingMode: "CUSTOM", customPriceMinor: dailyPriceMinor }],
      })
      .expect(201);
  }

  /** Creates + issues an invoice for 1000.00 (100_000 minor) with the given dueDate (offset days from now; negative = already overdue). */
  async function createIssuedInvoice(
    dueDateOffsetDays: number,
    tid = tenantId,
    cookie = accessCookie,
    custId = customerId,
    astId = assetId,
    bankId = bankAccountId,
    currency = "USD",
  ): Promise<{ id: string; totalMinor: number }> {
    const rental = await createRental(tid, cookie, custId, astId, 100_000, currency);
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tid}/invoices`)
      .set("Cookie", cookie)
      .send({ rentalId: rental.body.id, bankAccountId: bankId, dueDate: dateOffset(dueDateOffsetDays) })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/tenants/${tid}/invoices/${created.body.id}/issue`)
      .set("Cookie", cookie)
      .send({})
      .expect(201);
    return { id: created.body.id, totalMinor: issued.body.totalMinor };
  }

  // -----------------------------------------------------------------
  // Payment status matrix (Phase 33)
  // -----------------------------------------------------------------

  describe("Derived payment status", () => {
    it("1. total 1000, paid 0, due in future -> UNPAID", async () => {
      const invoice = await createIssuedInvoice(5);
      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paymentStatus).toBe("UNPAID");
      expect(detail.body.isOverdue).toBe(false);
    });

    it("2. total 1000, paid 300, due in future -> PARTIALLY_PAID", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);
      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paymentStatus).toBe("PARTIALLY_PAID");
      expect(detail.body.percentagePaid).toBe(30);
      expect(detail.body.remainingMinor).toBe(70_000);
    });

    it("3. total 1000, paid 1000 -> PAID", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 100_000, paymentDate: dateOffset(0) })
        .expect(201);
      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paymentStatus).toBe("PAID");
      expect(detail.body.status).toBe("PAID");
    });

    it("4. total 1000, paid 0, due yesterday -> OVERDUE", async () => {
      const invoice = await createIssuedInvoice(-1);
      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paymentStatus).toBe("OVERDUE");
      expect(detail.body.isOverdue).toBe(true);
      expect(detail.body.overdueDays).toBeGreaterThanOrEqual(1);
      expect(detail.body.overdueAmountMinor).toBe(100_000);
    });

    it("5. total 1000, paid 300, due yesterday -> PARTIALLY_PAID_OVERDUE", async () => {
      const invoice = await createIssuedInvoice(-6);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);
      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paymentStatus).toBe("PARTIALLY_PAID_OVERDUE");
      expect(detail.body.overdueAmountMinor).toBe(70_000);
      expect(detail.body.overdueDays).toBeGreaterThanOrEqual(6);
    });
  });

  // -----------------------------------------------------------------
  // One-click "Mark as paid" + partial payment + void (Phases 5,6,8,33)
  // -----------------------------------------------------------------

  describe("Payment ledger", () => {
    it("8. one-click mark-fully-paid uses the exact server-computed remaining balance, never a client-supplied amount", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 40_000, paymentDate: dateOffset(0) })
        .expect(201);

      const marked = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      expect(marked.body.amountMinor).toBe(60_000);

      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body).toMatchObject({ status: "PAID", paidMinor: 100_000, remainingMinor: 0 });
    });

    it("mark-fully-paid on an already-fully-paid invoice is rejected, not a second payment", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(409);
    });

    it("6/7. multiple partial payments accumulate correctly; overpayment is blocked", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 20_000, paymentDate: dateOffset(0) })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body).toMatchObject({ paidMinor: 50_000, remainingMinor: 50_000 });
      expect(detail.body.percentagePaid).toBe(50);

      // Attempting to overpay the remaining 50_000 by even 1 minor unit is rejected.
      const overpay = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 50_001, paymentDate: dateOffset(0) })
        .expect(400);
      expect(JSON.stringify(overpay.body)).toMatch(/overpayment|exceeds/i);
    });

    it("payment currency must match the invoice currency — no automatic FX conversion", async () => {
      const invoice = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 10_000, currency: "EUR", paymentDate: dateOffset(0) })
        .expect(400);
    });

    it("6. void: a mistaken payment is voided (never hard-deleted) and excluded from totals", async () => {
      const invoice = await createIssuedInvoice(5);
      const payment = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 40_000, paymentDate: dateOffset(0) })
        .expect(201);

      const afterPayment = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(afterPayment.body.paidMinor).toBe(40_000);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/${payment.body.id}/void`)
        .set("Cookie", accessCookie)
        .send({ reason: "Entered by mistake — wrong invoice" })
        .expect(201);

      const afterVoid = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(afterVoid.body).toMatchObject({
        status: "ISSUED",
        paidMinor: 0,
        remainingMinor: 100_000,
        paymentStatus: "UNPAID",
      });

      // Still in the ledger, visibly marked voided — never gone.
      const list = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].voidedAt).not.toBeNull();
      expect(list.body[0].voidReason).toBe("Entered by mistake — wrong invoice");
      expect(list.body[0].amountMinor).toBe(40_000);
    });

    it("cannot void the same payment twice", async () => {
      const invoice = await createIssuedInvoice(5);
      const payment = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 40_000, paymentDate: dateOffset(0) })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/${payment.body.id}/void`)
        .set("Cookie", accessCookie)
        .send({ reason: "first void" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/${payment.body.id}/void`)
        .set("Cookie", accessCookie)
        .send({ reason: "second void" })
        .expect(409);
    });

    it("9. concurrent double-click mark-fully-paid never creates a duplicate/overpaying entry", async () => {
      const invoice = await createIssuedInvoice(5);

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
          .set("Cookie", accessCookie)
          .send({}),
        request(app.getHttpServer())
          .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
          .set("Cookie", accessCookie)
          .send({}),
      ]);

      const statuses = [first.status, second.status].sort();
      // Exactly one succeeds (201); the other is rejected once it sees the
      // invoice is already fully paid (409) — never both succeeding.
      expect(statuses).toEqual([201, 409]);

      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body.paidMinor).toBe(100_000);
      expect(detail.body.status).toBe("PAID");

      const payments = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(payments.body).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // Deposits stay separate; explicit "Apply deposit to balance" (Phases 9, 10, 34)
  // -----------------------------------------------------------------

  describe("Deposit separation and application", () => {
    async function createRentalWithDeposit(depositMinor: number) {
      const rental = await createRental();
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit/receive`)
        .set("Cookie", accessCookie)
        .send({
          receivedAt: dateOffset(0),
          receivedAmountMinor: depositMinor,
          receivedMethod: "BANK_TRANSFER",
        })
        .expect(201);
      const deposit = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/rentals/${rental.body.id}/deposit`)
        .set("Cookie", accessCookie)
        .expect(200);
      return { rentalId: rental.body.id, depositId: deposit.body.id };
    }

    it("a received deposit is never counted as paid rental revenue by itself", async () => {
      const { rentalId, depositId } = await createRentalWithDeposit(50_000);
      expect(depositId).toBeTruthy();

      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId, bankAccountId })
        .expect(201);
      const issued = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      expect(issued.body.totalMinor).toBe(100_000);
      expect(issued.body.paidMinor).toBe(0);
      expect(issued.body.status).not.toBe("PAID");
    });

    it("10. applying part of a held deposit to an invoice's balance is a real, auditable payment", async () => {
      const { rentalId, depositId } = await createRentalWithDeposit(50_000);
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId, bankAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const applied = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: depositId, amountMinor: 40_000 })
        .expect(201);
      expect(applied.body.sourceRentalDepositId).toBe(depositId);

      const detail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(detail.body).toMatchObject({ paidMinor: 40_000, remainingMinor: 60_000 });

      // Only 10_000 of the 50_000 deposit remains available — a second
      // application beyond that is rejected.
      const overApply = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: depositId, amountMinor: 15_000 })
        .expect(400);
      expect(JSON.stringify(overApply.body)).toMatch(/available/i);

      // But applying exactly the remaining 10_000 succeeds.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: depositId, amountMinor: 10_000 })
        .expect(201);

      const finalDetail = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${created.body.id}`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(finalDetail.body.paidMinor).toBe(50_000);
    });

    it("applying more than the invoice's own remaining balance is rejected", async () => {
      const { rentalId, depositId } = await createRentalWithDeposit(200_000);
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId, bankAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      // Deposit has 200_000 available but the invoice only owes 100_000.
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/payments/apply-deposit`)
        .set("Cookie", accessCookie)
        .send({ rentalDepositId: depositId, amountMinor: 150_000 })
        .expect(400);
    });
  });

  // -----------------------------------------------------------------
  // Tenant isolation & RBAC (Phases 30, 31)
  // -----------------------------------------------------------------

  describe("Tenant isolation and RBAC", () => {
    it("Tenant A cannot read, pay, void, or apply-deposit against Tenant B's invoice", async () => {
      const invoice = await createIssuedInvoice(5);
      const other = await setUpTenant({ email: "other-owner@example.com", companyName: "Other Co" });

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}`)
        .set("Cookie", other.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", other.cookie)
        .send({ amountMinor: 10_000, paymentDate: dateOffset(0) })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
        .set("Cookie", other.cookie)
        .send({})
        .expect(403);
    });

    it("VIEWER can read payments but cannot record, void, mark-paid, or apply a deposit", async () => {
      const invoice = await createIssuedInvoice(5);
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer@example.com");

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", viewerCookie)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", viewerCookie)
        .send({ amountMinor: 10_000, paymentDate: dateOffset(0) })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/mark-fully-paid`)
        .set("Cookie", viewerCookie)
        .send({})
        .expect(403);
    });

    it("VIEWER cannot void a payment recorded by another staff member", async () => {
      const invoice = await createIssuedInvoice(5);
      const payment = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 10_000, paymentDate: dateOffset(0) })
        .expect(201);
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer2@example.com");
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments/${payment.body.id}/void`)
        .set("Cookie", viewerCookie)
        .send({ reason: "should be blocked" })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------
  // Receivable aging + financial summary foundation (Phases 25, 26)
  // -----------------------------------------------------------------

  describe("Receivable aging and financial summary", () => {
    it("buckets outstanding invoices by days overdue, grouped by currency", async () => {
      await createIssuedInvoice(5); // not due yet -> NOT_DUE, excluded from overdue buckets but present as NOT_DUE
      await createIssuedInvoice(-3); // 1_7_DAYS
      await createIssuedInvoice(-40); // 31_60_DAYS

      const aging = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/receivables/aging`)
        .set("Cookie", accessCookie)
        .expect(200);

      const buckets = aging.body as { bucket: string; currency: string; outstandingMinor: number }[];
      expect(buckets.find((b) => b.bucket === "NOT_DUE" && b.currency === "USD")).toMatchObject({
        outstandingMinor: 100_000,
      });
      expect(buckets.find((b) => b.bucket === "1_7_DAYS" && b.currency === "USD")).toMatchObject({
        outstandingMinor: 100_000,
      });
      expect(buckets.find((b) => b.bucket === "31_60_DAYS" && b.currency === "USD")).toMatchObject({
        outstandingMinor: 100_000,
      });
    });

    it("financial summary reports invoiced/paid/outstanding/overdue per currency, never mixed", async () => {
      const invoice = await createIssuedInvoice(-3);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);

      const from = new Date();
      from.setUTCDate(from.getUTCDate() - 10);
      const to = new Date();
      to.setUTCDate(to.getUTCDate() + 10);

      const summary = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/receivables/summary`)
        .query({ from: from.toISOString(), to: to.toISOString() })
        .set("Cookie", accessCookie)
        .expect(200);

      const usd = (summary.body as { currency: string }[]).find((r) => r.currency === "USD");
      expect(usd).toMatchObject({
        invoicedMinor: 100_000,
        paidMinor: 30_000,
        outstandingMinor: 70_000,
        overdueMinor: 70_000,
      });
    });
  });

  // -----------------------------------------------------------------
  // International Payment Demand foundation (Phases 18-23, 35)
  // -----------------------------------------------------------------

  describe("Payment Demand — international core + Poland's first template", () => {
    it("21. cannot generate a formal demand for a non-overdue or fully-paid invoice", async () => {
      const notOverdue = await createIssuedInvoice(5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${notOverdue.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(14) })
        .expect(409);

      const overdueButPaid = await createIssuedInvoice(-5);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${overdueButPaid.id}/payments/mark-fully-paid`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${overdueButPaid.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(14) })
        .expect(409);
    });

    it("generates a demand for an overdue invoice with the frozen amount breakdown, downloadable as a PDF", async () => {
      const invoice = await createIssuedInvoice(-6);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);

      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(14) })
        .expect(201);
      expect(created.body).toMatchObject({
        status: "GENERATED",
        currency: "USD",
        originalAmountMinor: 100_000,
        paidAmountMinor: 30_000,
        outstandingAmountMinor: 70_000,
        countryCode: "US",
      });
      expect(created.body.demandNumber).toMatch(/^PD-\d{4}-\d{2}-\d{6}$/);

      const pdf = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands/${created.body.id}/pdf`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
      expect((pdf.body as Buffer).length).toBeGreaterThan(500);
    });

    it("Poland: renders the real 'WEZWANIE DO ZAPŁATY' title in Polish", async () => {
      const pl = await setUpTenant({
        email: "pl-owner@example.com",
        companyName: "Polska Firma",
        countryCode: "PL",
        defaultLanguage: "pl",
        defaultCurrency: "PLN",
      });
      const invoice = await createIssuedInvoice(-10, pl.tenantId, pl.cookie, pl.customerId, pl.assetId, pl.bankAccountId);
      const demand = await request(app.getHttpServer())
        .post(`/tenants/${pl.tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", pl.cookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(201);
      expect(demand.body.countryCode).toBe("PL");

      const preview = await request(app.getHttpServer())
        .get(`/tenants/${pl.tenantId}/invoices/${invoice.id}/payment-demands/${demand.body.id}/preview`)
        .set("Cookie", pl.cookie)
        .expect(200);
      expect(preview.body.html).toContain("WEZWANIE DO ZAPŁATY");
      expect(preview.body.html).toContain("Wierzyciel"); // "Creditor" — real Polish party-block label
    });

    it("35. Germany and USA (no dedicated template yet) safely fall back to the generic international template — never leaking Polish wording", async () => {
      const de = await setUpTenant({
        email: "de-owner@example.com",
        companyName: "Deutsche Firma",
        countryCode: "DE",
        defaultLanguage: "de",
        defaultCurrency: "EUR",
      });
      const deInvoice = await createIssuedInvoice(
        -10,
        de.tenantId,
        de.cookie,
        de.customerId,
        de.assetId,
        de.bankAccountId,
        "EUR",
      );
      const deDemand = await request(app.getHttpServer())
        .post(`/tenants/${de.tenantId}/invoices/${deInvoice.id}/payment-demands`)
        .set("Cookie", de.cookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(201);
      expect(deDemand.body.countryCode).toBe("DE");
      expect(deDemand.body.currency).toBe("EUR");

      const dePreview = await request(app.getHttpServer())
        .get(`/tenants/${de.tenantId}/invoices/${deInvoice.id}/payment-demands/${deDemand.body.id}/preview`)
        .set("Cookie", de.cookie)
        .expect(200);
      expect(dePreview.body.html).not.toContain("WEZWANIE DO ZAPŁATY");
      expect(dePreview.body.html).not.toContain("NIP");

      // USA (the default test tenant's own country) — same safe fallback.
      const usInvoice = await createIssuedInvoice(-10);
      const usDemand = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${usInvoice.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(201);
      expect(usDemand.body.countryCode).toBe("US");
      expect(usDemand.body.currency).toBe("USD");
      const usPreview = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${usInvoice.id}/payment-demands/${usDemand.body.id}/preview`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(usPreview.body.html).not.toContain("WEZWANIE DO ZAPŁATY");
      expect(usPreview.body.html).toContain("Payment Demand");
    });

    it("send email path runs truthfully — reports NOT_CONFIGURED rather than a fabricated SENT (no real SMTP provider in this environment)", async () => {
      const invoice = await createIssuedInvoice(-5);
      const demand = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(201);

      const sendResult = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands/${demand.body.id}/email`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      expect(sendResult.body.sent).toBe(false);

      const deliveries = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands/${demand.body.id}/email-deliveries`)
        .set("Cookie", accessCookie)
        .expect(200);
      expect(deliveries.body[0].status).toBe("NOT_CONFIGURED");
      // Never a raw storage path/URL in the response.
      expect(JSON.stringify(deliveries.body)).not.toContain("tenants/");
    });

    it("Tenant A cannot read, create, or download Tenant B's payment demand / demand PDF", async () => {
      const invoice = await createIssuedInvoice(-5);
      const demand = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", accessCookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(201);

      const other = await setUpTenant({ email: "other2@example.com", companyName: "Other Co 2" });
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands/${demand.body.id}/pdf`)
        .set("Cookie", other.cookie)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", other.cookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(403);
    });

    it("VIEWER can view demands but cannot create or send one", async () => {
      const invoice = await createIssuedInvoice(-5);
      const viewerCookie = await createMemberWithRole("VIEWER", "viewer3@example.com");
      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", viewerCookie)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoice.id}/payment-demands`)
        .set("Cookie", viewerCookie)
        .send({ requestedDeadline: dateOffset(7) })
        .expect(403);
    });
  });

  // -----------------------------------------------------------------
  // Customer Portal financial visibility (Phase 24)
  // -----------------------------------------------------------------

  describe("Customer Portal balance display", () => {
    it("shows amount due/paid/outstanding/overdue for the customer's own rental, never a DRAFT invoice", async () => {
      const rental = await createRental();
      const draft = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId: rental.body.id, bankAccountId, dueDate: dateOffset(-2) })
        .expect(201);
      // Still DRAFT — never shown to the customer.
      expect(draft.body.status).toBe("DRAFT");
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${draft.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${draft.body.id}/payments`)
        .set("Cookie", accessCookie)
        .send({ amountMinor: 30_000, paymentDate: dateOffset(0) })
        .expect(201);

      const inviteResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      const token = tokenFromInviteLink(inviteResponse.body.inviteLink);
      const activateResponse = await request(app.getHttpServer())
        .post("/portal/auth/activate-invitation")
        .send({ token, password: "SuperSecretPortal123" })
        .expect(200);
      const portalCookie = extractCookie(activateResponse.headers, "rentos_portal_access_token");

      const portalDetail = await request(app.getHttpServer())
        .get(`/portal/rentals/${rental.body.id}`)
        .set("Cookie", portalCookie)
        .expect(200);
      expect(portalDetail.body.invoiceFinancials).toHaveLength(1);
      expect(portalDetail.body.invoiceFinancials[0]).toMatchObject({
        totalMinor: 100_000,
        paidMinor: 30_000,
        remainingMinor: 70_000,
        paymentStatus: "PARTIALLY_PAID_OVERDUE",
        isOverdue: true,
      });
      // Never a raw storage path/URL, never internal notes.
      expect(JSON.stringify(portalDetail.body)).not.toContain("tenants/");
    });

    it("a portal session never sees another customer's rental financials", async () => {
      const rental = await createRental();
      const created = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices`)
        .set("Cookie", accessCookie)
        .send({ rentalId: rental.body.id, bankAccountId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${created.body.id}/issue`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);

      const otherCustomer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set("Cookie", accessCookie)
        .send({ firstName: "Other", lastName: "Customer", email: "other-customer@example.com" })
        .expect(201);
      const inviteResponse = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers/${otherCustomer.body.id}/portal/invite`)
        .set("Cookie", accessCookie)
        .send({})
        .expect(201);
      const token = tokenFromInviteLink(inviteResponse.body.inviteLink);
      const activateResponse = await request(app.getHttpServer())
        .post("/portal/auth/activate-invitation")
        .send({ token, password: "SuperSecretPortal123" })
        .expect(200);
      const otherPortalCookie = extractCookie(
        activateResponse.headers,
        "rentos_portal_access_token",
      );

      await request(app.getHttpServer())
        .get(`/portal/rentals/${rental.body.id}`)
        .set("Cookie", otherPortalCookie)
        .expect(404);
    });
  });
});
