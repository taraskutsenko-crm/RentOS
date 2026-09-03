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
