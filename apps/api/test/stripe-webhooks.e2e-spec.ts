import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

const FAKE_WEBHOOK_SECRET = "whsec_fake_secret_for_local_signature_tests_only";
const stripeForSigning = new Stripe("sk_test_fake_key_for_local_signature_tests_only", {
  apiVersion: "2026-08-26.dahlia",
});

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

function signedRequest(app: INestApplication, payload: object) {
  const raw = JSON.stringify(payload);
  const signature = stripeForSigning.webhooks.generateTestHeaderString({
    payload: raw,
    secret: FAKE_WEBHOOK_SECRET,
  });
  return request(app.getHttpServer())
    .post("/billing/stripe/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", signature)
    .send(raw);
}

function fakeSubscriptionUpdatedEvent(eventId: string, tenantId: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: eventId,
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_fake_${tenantId}`,
        object: "subscription",
        customer: `cus_fake_${tenantId}`,
        status: "active",
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: { tenantId },
        items: {
          object: "list",
          data: [
            {
              id: "si_fake",
              price: { id: "price_fake_unmapped" },
              current_period_start: now,
              current_period_end: now + 30 * 24 * 60 * 60,
            },
          ],
        },
      },
    },
  };
}

function fakeInvoicePaidEvent(eventId: string, invoiceId: string, subscriptionId: string) {
  return {
    id: eventId,
    object: "event",
    type: "invoice.paid",
    data: {
      object: {
        id: invoiceId,
        object: "invoice",
        currency: "eur",
        amount_paid: 5520,
        total_excluding_tax: 5520,
        parent: { type: "subscription_details", subscription_details: { subscription: subscriptionId } },
      },
    },
  };
}

/**
 * Havelio Billing (Stage 17) — proves signature verification and webhook
 * idempotency without any real Stripe network call (see docs/DECISIONS.md
 * "REAL STRIPE CONNECTION: NOT CONFIGURED" — signature construction/
 * verification is pure local crypto, exactly the technique the task itself
 * suggests). Uses `customer.subscription.updated`, the one event type whose
 * handler never calls back out to Stripe (see SubscriptionsService.
 * handleSubscriptionUpsert).
 */
describe("Stripe webhooks E2E — signature verification + idempotency", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenantId: string;

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
  });

  it("rejects a request with no stripe-signature header", async () => {
    await request(app.getHttpServer())
      .post("/billing/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(fakeSubscriptionUpdatedEvent("evt_1", tenantId)))
      .expect(400);
  });

  it("rejects a request with an invalid/forged signature", async () => {
    await request(app.getHttpServer())
      .post("/billing/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1,v1=deadbeef")
      .send(JSON.stringify(fakeSubscriptionUpdatedEvent("evt_2", tenantId)))
      .expect(400);
  });

  it("accepts a validly-signed event and applies it", async () => {
    const event = fakeSubscriptionUpdatedEvent("evt_valid_1", tenantId);
    await signedRequest(app, event).expect(200);

    const subscription = await prisma.havelioSubscription.findUnique({ where: { tenantId } });
    expect(subscription?.status).toBe("ACTIVE");
    expect(subscription?.stripeSubscriptionId).toBe(`sub_fake_${tenantId}`);
  });

  it("is idempotent: the same event id delivered twice is only processed once", async () => {
    const event = fakeSubscriptionUpdatedEvent("evt_dup_1", tenantId);
    await signedRequest(app, event).expect(200);
    await signedRequest(app, event).expect(200);

    const eventRows = await prisma.stripeWebhookEvent.count({ where: { id: "evt_dup_1" } });
    expect(eventRows).toBe(1);

    // A duplicate delivery must not double-log the activation audit entry.
    const activationLogs = await prisma.auditLog.count({
      where: { tenantId, action: "billing.subscription.activated" },
    });
    expect(activationLogs).toBe(1);
  });
});

/**
 * Havelio Affiliate/Partner domain (Stage 17 closure pass) — proves the
 * webhook-driven commission path end-to-end: exactly one
 * AffiliateCommissionEntry AND exactly one corresponding AuditLog row are
 * ever created, even when Stripe redelivers the same `invoice.paid` event —
 * matching item 8/G of the closure task ("exactly one financial ledger
 * effect -> exactly one corresponding audit event").
 */
describe("Stripe webhooks E2E — affiliate commission idempotency + audit", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenantId: string;
  let partnerId: string;
  let campaignId: string;

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

    const partner = await prisma.affiliatePartner.create({
      data: { displayName: "RentalPro", email: "partner@rentalpro.example.com", createdByUserId: body.user.id },
    });
    partnerId = partner.id;
    const campaign = await prisma.affiliateCampaign.create({
      data: { partnerId, name: "Test Campaign", slug: "rentalpro-e2e", commissionRateBp: 2500, commissionDurationMonths: 12 },
    });
    campaignId = campaign.id;
    await prisma.affiliateAttribution.create({
      data: { tenantId, partnerId, campaignId, source: "REFERRAL_LINK" },
    });

    // Link the tenant's HavelioSubscription to a real Stripe subscription
    // id first (via the already-proven subscription.updated path), so
    // SubscriptionsService.findTenantIdForSubscription can resolve it.
    await signedRequest(app, fakeSubscriptionUpdatedEvent("evt_setup_sub", tenantId)).expect(200);
  });

  it("earns a commission from a real invoice.paid event, computed from actual collected revenue", async () => {
    const invoiceId = "in_e2e_1";
    const event = fakeInvoicePaidEvent("evt_invoice_1", invoiceId, `sub_fake_${tenantId}`);
    await signedRequest(app, event).expect(200);

    const entries = await prisma.affiliateCommissionEntry.findMany({ where: { partnerId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      eventType: "COMMISSION_EARNED",
      tenantId,
      campaignId,
      eligibleRevenueMinor: 5520,
      commissionRateBp: 2500,
      amountMinor: 1380, // 25% of €55.20
    });

    const auditLogs = await prisma.auditLog.count({
      where: { tenantId, action: "billing.affiliate_commission.earned" },
    });
    expect(auditLogs).toBe(1);
  });

  it("is idempotent at the ledger level: two DIFFERENT Stripe events for the SAME invoice still create only one commission entry", async () => {
    // Deliberately two distinct event ids (not a literal redelivery of the
    // same event, already proven above and covered by the top-level
    // StripeWebhookEvent guard) — this exercises the second, independent
    // idempotency guarantee: AffiliateCommissionEntry's own
    // @@unique([stripeInvoiceId, eventType]) constraint, for the case where
    // Stripe legitimately sends more than one event referencing the same
    // invoice.
    const invoiceId = "in_e2e_2";
    await signedRequest(app, fakeInvoicePaidEvent("evt_invoice_2a", invoiceId, `sub_fake_${tenantId}`)).expect(200);
    await signedRequest(app, fakeInvoicePaidEvent("evt_invoice_2b", invoiceId, `sub_fake_${tenantId}`)).expect(200);

    const entries = await prisma.affiliateCommissionEntry.count({
      where: { partnerId, eventType: "COMMISSION_EARNED" },
    });
    expect(entries).toBe(1);

    const auditLogs = await prisma.auditLog.count({
      where: { tenantId, action: "billing.affiliate_commission.earned" },
    });
    expect(auditLogs).toBe(1);
  });
});
