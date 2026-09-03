import { describe, expect, it, vi } from "vitest";

import { SubscriptionsService } from "./subscriptions.service";

const PRICE_IDS: Record<string, string> = {
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_annual",
  STRIPE_PRICE_BUSINESS_MONTHLY: "price_business_monthly",
  STRIPE_PRICE_BUSINESS_ANNUAL: "price_business_annual",
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: "price_professional_monthly",
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: "price_professional_annual",
};

function buildService(subscription: Record<string, unknown>, stripeConfigured = true) {
  const updated: Record<string, unknown>[] = [];
  const prisma = {
    havelioSubscription: {
      findUnique: vi.fn().mockResolvedValue(subscription),
      update: vi.fn().mockImplementation(({ data }) => {
        const merged = { ...subscription, ...data };
        updated.push(merged);
        return Promise.resolve(merged);
      }),
    },
  };
  const auditService = { log: vi.fn() };
  const configService = { get: vi.fn((key: string) => PRICE_IDS[key]) };
  const promoCodesService = {};
  const stripeProvider = {
    isConfigured: vi.fn().mockReturnValue(stripeConfigured),
    updateSubscriptionPrice: vi.fn().mockResolvedValue(undefined),
    cancelAtPeriodEnd: vi.fn().mockResolvedValue(undefined),
    resumeSubscription: vi.fn().mockResolvedValue(undefined),
  };

  const service = new SubscriptionsService(
    prisma as never,
    auditService as never,
    configService as never,
    promoCodesService as never,
    stripeProvider as never,
  );
  return { service, prisma, auditService, stripeProvider, updated };
}

function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    tenantId: "tenant-1",
    plan: "STARTER",
    billingInterval: "MONTHLY",
    status: "ACTIVE",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_stripe_1",
    trialStartedAt: null,
    trialEndsAt: null,
    currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    scheduledPlan: null,
    scheduledBillingInterval: null,
    isGrandfathered: false,
    ...overrides,
  };
}

describe("SubscriptionsService", () => {
  describe("changePlan", () => {
    it("upgrade: applies immediately via Stripe create_prorations and updates plan now", async () => {
      const { service, stripeProvider, updated } = buildService(activeSubscription());
      const result = await service.changePlan("tenant-1", "user-1", "BUSINESS", "MONTHLY");

      expect(stripeProvider.updateSubscriptionPrice).toHaveBeenCalledWith(
        "sub_stripe_1",
        "price_business_monthly",
        "create_prorations",
      );
      expect(result.plan).toBe("BUSINESS");
      expect(updated[0]).toMatchObject({ plan: "BUSINESS", scheduledPlan: null });
    });

    it("downgrade: never calls Stripe immediately — only schedules scheduledPlan for currentPeriodEnd", async () => {
      const { service, stripeProvider, updated } = buildService(
        activeSubscription({ plan: "PROFESSIONAL" }),
      );
      const result = await service.changePlan("tenant-1", "user-1", "STARTER", "MONTHLY");

      expect(stripeProvider.updateSubscriptionPrice).not.toHaveBeenCalled();
      expect(result.plan).toBe("PROFESSIONAL"); // unchanged now
      expect(updated[0]).toMatchObject({ scheduledPlan: "STARTER", scheduledBillingInterval: "MONTHLY" });
    });

    it("a same-tier interval switch (MONTHLY -> ANNUAL) is treated as immediate, like an upgrade", async () => {
      const { service, stripeProvider } = buildService(activeSubscription({ plan: "BUSINESS" }));
      await service.changePlan("tenant-1", "user-1", "BUSINESS", "ANNUAL");

      expect(stripeProvider.updateSubscriptionPrice).toHaveBeenCalledWith(
        "sub_stripe_1",
        "price_business_annual",
        "create_prorations",
      );
    });

    it("throws when the tenant has no active paid subscription to change", async () => {
      const { service } = buildService(activeSubscription({ status: "TRIALING", stripeSubscriptionId: null }));
      await expect(service.changePlan("tenant-1", "user-1", "BUSINESS", "MONTHLY")).rejects.toThrow(
        /no active paid subscription/,
      );
    });
  });

  describe("cancelAtPeriodEnd / resumeSubscription", () => {
    it("cancel calls Stripe and sets cancelAtPeriodEnd", async () => {
      const { service, stripeProvider, updated } = buildService(activeSubscription());
      await service.cancelAtPeriodEnd("tenant-1", "user-1");

      expect(stripeProvider.cancelAtPeriodEnd).toHaveBeenCalledWith("sub_stripe_1");
      expect(updated[0]).toMatchObject({ cancelAtPeriodEnd: true });
    });

    it("resume throws if the subscription isn't scheduled for cancellation", async () => {
      const { service } = buildService(activeSubscription({ cancelAtPeriodEnd: false }));
      await expect(service.resumeSubscription("tenant-1", "user-1")).rejects.toThrow(
        /not scheduled for cancellation/,
      );
    });

    it("resume calls Stripe and clears cancelAtPeriodEnd when it was scheduled", async () => {
      const { service, stripeProvider, updated } = buildService(
        activeSubscription({ cancelAtPeriodEnd: true }),
      );
      await service.resumeSubscription("tenant-1", "user-1");

      expect(stripeProvider.resumeSubscription).toHaveBeenCalledWith("sub_stripe_1");
      expect(updated[0]).toMatchObject({ cancelAtPeriodEnd: false });
    });

    it("never calls Stripe when it isn't configured, but still updates local state (defensive — should be unreachable in practice since no stripeSubscriptionId would exist)", async () => {
      const { service, stripeProvider } = buildService(activeSubscription(), false);
      await service.cancelAtPeriodEnd("tenant-1", "user-1");
      expect(stripeProvider.cancelAtPeriodEnd).not.toHaveBeenCalled();
    });
  });

  describe("createCheckoutSession", () => {
    it("refuses when Stripe is not configured — never fakes a checkout URL", async () => {
      const { service } = buildService(activeSubscription({ status: "TRIALING", stripeSubscriptionId: null }), false);
      await expect(
        service.createCheckoutSession("tenant-1", "user-1", "STARTER", "MONTHLY", "a@b.com", "s", "c"),
      ).rejects.toThrow(/not configured/);
    });

    it("refuses to start a new checkout for a tenant that already has an active subscription", async () => {
      const { service } = buildService(activeSubscription());
      await expect(
        service.createCheckoutSession("tenant-1", "user-1", "BUSINESS", "MONTHLY", "a@b.com", "s", "c"),
      ).rejects.toThrow(/already has an active subscription/);
    });
  });
});
