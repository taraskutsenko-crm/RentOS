import type { INestApplication } from "@nestjs/common";
import { PrismaClient, type HavelioPlan, type HavelioSubscriptionStatus } from "@prisma/client";
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

/**
 * Havelio Billing (Stage 17 closure pass) — proves plan-based feature
 * entitlement is REALLY enforced at the backend for the five Business-tier
 * features named in the closure task (Payments, Payment Demands, Financial
 * Reports, Customer Portal, Electronic Signatures), not merely
 * implemented-but-unwired. Also proves the independence of tenant RBAC
 * (PermissionsGuard) from Havelio plan entitlement (FeatureEntitlementGuard)
 * — a caller must satisfy BOTH.
 */
describe("Entitlement feature-gating E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerCookie: string;
  let tenantId: string;
  let customerId: string;
  let assetId: string;
  let bankAccountId: string;
  let invoiceId: string;
  let documentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function setPlan(
    status: HavelioSubscriptionStatus,
    plan: HavelioPlan,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const now = new Date();
    await prisma.havelioSubscription.update({
      where: { tenantId },
      data: {
        status,
        plan,
        isGrandfathered: false,
        ...(status === "ACTIVE" || status === "PAST_DUE"
          ? {
              billingInterval: "MONTHLY",
              currentPeriodStart: now,
              currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            }
          : {}),
        ...(status === "TRIALING"
          ? { trialStartedAt: now, trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) }
          : {}),
        ...extra,
      },
    });
  }

  async function createMemberWithRole(role: string, email: string): Promise<string> {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName: `${role} Co` })
      .expect(201);
    const memberBody = registerResponse.body as RegisterResponseBody;
    const memberCookie = extractCookie(registerResponse.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: memberBody.user.id, role: role as never, status: "ACTIVE" },
    });
    return memberCookie;
  }

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    tenantId = body.tenant.id;
    ownerCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", ownerCookie)
      .send({ name: "Generators" })
      .expect(201);
    const categoryId = categoryResponse.body.id;

    const assetResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", ownerCookie)
      .send({ name: "Generator A", internalNumber: "GEN-0001", categoryId })
      .expect(201);
    assetId = assetResponse.body.id;

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", ownerCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;

    const bankResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/bank-accounts`)
      .set("Cookie", ownerCookie)
      .send({ label: "Main account", currency: "USD" })
      .expect(201);
    bankAccountId = bankResponse.body.id;

    const rentalResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/rentals`)
      .set("Cookie", ownerCookie)
      .send({
        customerId,
        currency: "USD",
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(2),
        items: [{ assetId, billingMode: "CUSTOM", customPriceMinor: 100_000 }],
      })
      .expect(201);
    const rentalId = rentalResponse.body.id;

    // Overdue on purpose — Payment Demands can only be generated for an
    // overdue invoice (PaymentDemandsService.create), and this fixture is
    // shared by the payment-demand tests below.
    const invoiceResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices`)
      .set("Cookie", ownerCookie)
      .send({ rentalId, bankAccountId, dueDate: dateOffset(-1) })
      .expect(201);
    invoiceId = invoiceResponse.body.id;
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${invoiceId}/issue`)
      .set("Cookie", ownerCookie)
      .send({})
      .expect(201);

    const documentResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents`)
      .set("Cookie", ownerCookie)
      .send({ documentType: "CONTRACT", customerId, rentalId, title: "Rental contract" })
      .expect(201);
    documentId = documentResponse.body.id;
  });

  // -------------------------------------------------------------------
  // Actions under test — one per feature, all mutating/creating actions.
  // -------------------------------------------------------------------
  function recordPayment() {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${invoiceId}/payments`)
      .set("Cookie", ownerCookie)
      .send({ amountMinor: 10_000, paymentDate: dateOffset(0) });
  }
  function listPayments() {
    return request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${invoiceId}/payments`)
      .set("Cookie", ownerCookie);
  }
  function createPaymentDemand() {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invoices/${invoiceId}/payment-demands`)
      .set("Cookie", ownerCookie)
      .send({ requestedDeadline: dateOffset(14) });
  }
  function listPaymentDemands() {
    return request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invoices/${invoiceId}/payment-demands`)
      .set("Cookie", ownerCookie);
  }
  function getFinanceOverview() {
    return request(app.getHttpServer())
      .get(`/tenants/${tenantId}/finance-reports/overview?period=ALL_TIME`)
      .set("Cookie", ownerCookie);
  }
  function invitePortalCustomer() {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
      .set("Cookie", ownerCookie)
      .send({});
  }
  function requestSignature() {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/documents/${documentId}/signature-requests`)
      .set("Cookie", ownerCookie)
      .send({});
  }

  const ENTITLEMENT_DENIED_BODY = {
    code: "ENTITLEMENT_DENIED",
    reason: { type: "FEATURE" },
  };

  describe("STARTER plan — Business-only operations denied", () => {
    beforeEach(async () => {
      await setPlan("ACTIVE", "STARTER");
    });

    it("denies recording a payment", async () => {
      const res = await recordPayment().expect(403);
      expect(res.body).toMatchObject({
        code: "ENTITLEMENT_DENIED",
        reason: { type: "FEATURE", feature: "PAYMENTS_DEBT_MANAGEMENT", availableFromPlan: "BUSINESS" },
      });
      expect(res.body.message).toMatch(/BUSINESS plan/);
    });

    it("denies creating a payment demand", async () => {
      const res = await createPaymentDemand().expect(403);
      expect(res.body).toMatchObject({
        code: "ENTITLEMENT_DENIED",
        reason: { type: "FEATURE", feature: "PAYMENT_DEMANDS", availableFromPlan: "BUSINESS" },
      });
    });

    it("denies financial reports", async () => {
      const res = await getFinanceOverview().expect(403);
      expect(res.body).toMatchObject({
        code: "ENTITLEMENT_DENIED",
        reason: { type: "FEATURE", feature: "FINANCIAL_REPORTS", availableFromPlan: "BUSINESS" },
      });
    });

    it("denies inviting a customer to the portal", async () => {
      const res = await invitePortalCustomer().expect(403);
      expect(res.body).toMatchObject({
        code: "ENTITLEMENT_DENIED",
        reason: { type: "FEATURE", feature: "CUSTOMER_PORTAL", availableFromPlan: "BUSINESS" },
      });
    });

    it("denies requesting an electronic signature", async () => {
      const res = await requestSignature().expect(403);
      expect(res.body).toMatchObject({
        code: "ENTITLEMENT_DENIED",
        reason: { type: "FEATURE", feature: "ELECTRONIC_SIGNATURES", availableFromPlan: "BUSINESS" },
      });
    });

    it("still allows viewing already-existing payments and payment demands (existing records stay safe)", async () => {
      await listPayments().expect(200);
      await listPaymentDemands().expect(200);
    });
  });

  describe("BUSINESS plan — allowed (where RBAC is also satisfied)", () => {
    beforeEach(async () => {
      await setPlan("ACTIVE", "BUSINESS");
    });

    it("allows recording a payment", async () => {
      await recordPayment().expect(201);
    });

    it("allows creating a payment demand", async () => {
      await createPaymentDemand().expect(201);
    });

    it("allows financial reports", async () => {
      await getFinanceOverview().expect(200);
    });

    it("allows inviting a customer to the portal", async () => {
      await invitePortalCustomer().expect(201);
    });

    it("allows requesting an electronic signature", async () => {
      await requestSignature().expect(201);
    });
  });

  describe("PROFESSIONAL plan — allowed", () => {
    beforeEach(async () => {
      await setPlan("ACTIVE", "PROFESSIONAL");
    });

    it("allows every Business-tier operation", async () => {
      await recordPayment().expect(201);
      await createPaymentDemand().expect(201);
      await getFinanceOverview().expect(200);
      await invitePortalCustomer().expect(201);
      await requestSignature().expect(201);
    });
  });

  describe("TRIALING — full meaningful evaluation access", () => {
    // beforeEach already leaves the tenant TRIALING (registration default) —
    // no setPlan() call needed, this proves the real, unmodified default.
    it("allows every Business-tier operation during an active trial", async () => {
      await recordPayment().expect(201);
      await createPaymentDemand().expect(201);
      await getFinanceOverview().expect(200);
      await invitePortalCustomer().expect(201);
      await requestSignature().expect(201);
    });
  });

  describe("GRANDFATHERED — preserves intended Professional access", () => {
    beforeEach(async () => {
      await setPlan("ACTIVE", "PROFESSIONAL", { isGrandfathered: true });
    });

    it("allows every Business-tier operation", async () => {
      await recordPayment().expect(201);
      await getFinanceOverview().expect(200);
    });
  });

  describe("EXPIRED trial — restricted, per the existing trial-expiration access policy", () => {
    beforeEach(async () => {
      await setPlan("TRIALING", "PROFESSIONAL", {
        trialStartedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
    });

    it("denies every Business-tier operation with a non-FEATURE, TRIAL_EXPIRED reason", async () => {
      const res = await recordPayment().expect(403);
      expect(res.body).toMatchObject({ code: "ENTITLEMENT_DENIED", reason: { type: "TRIAL_EXPIRED" } });
    });

    it("still allows viewing existing records", async () => {
      await listPayments().expect(200);
    });
  });

  describe("PAST_DUE — Stage 17 policy: never destroy access on one failed payment", () => {
    beforeEach(async () => {
      await setPlan("PAST_DUE", "BUSINESS");
    });

    it("still allows Business-tier operations", async () => {
      await recordPayment().expect(201);
      await getFinanceOverview().expect(200);
    });
  });

  describe("RBAC is independent of billing entitlement — BOTH must be satisfied", () => {
    it("a TECHNICIAN (no payments.record permission) is denied on BUSINESS plan for RBAC reasons, not entitlement", async () => {
      await setPlan("ACTIVE", "BUSINESS");
      const technicianCookie = await createMemberWithRole("TECHNICIAN", "tech@example.com");

      const res = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/invoices/${invoiceId}/payments`)
        .set("Cookie", technicianCookie)
        .send({ amountMinor: 10_000, paymentDate: dateOffset(0) })
        .expect(403);

      // A real PermissionsGuard denial — never the ENTITLEMENT_DENIED shape.
      expect(res.body.code).not.toBe("ENTITLEMENT_DENIED");
      expect(res.body.message).toBe("You do not have permission to perform this action");
    });

    it("an OWNER (full RBAC) is still denied on STARTER plan — RBAC alone is not enough", async () => {
      await setPlan("ACTIVE", "STARTER");
      const res = await recordPayment().expect(403);
      expect(res.body).toMatchObject(ENTITLEMENT_DENIED_BODY);
    });
  });
});
