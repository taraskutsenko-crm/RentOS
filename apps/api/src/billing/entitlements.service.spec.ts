import { describe, expect, it, vi } from "vitest";

import { EntitlementsService } from "./entitlements.service";

function buildService(subscription: Record<string, unknown>) {
  const prisma = {
    asset: { count: vi.fn().mockResolvedValue(0) },
    tenantMembership: { count: vi.fn().mockResolvedValue(0) },
  };
  const subscriptionsService = { getSubscription: vi.fn().mockResolvedValue(subscription) };
  const service = new EntitlementsService(prisma as never, subscriptionsService as never);
  return { service, prisma };
}

describe("EntitlementsService", () => {
  it("TRIALING grants full PROFESSIONAL-tier access (full evaluation)", async () => {
    const { service } = buildService({ status: "TRIALING", plan: "PROFESSIONAL", isGrandfathered: false });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("GRANTED");
    if (state.access === "GRANTED") expect(state.plan.plan).toBe("PROFESSIONAL");
  });

  it("ACTIVE grants access at the subscription's own plan", async () => {
    const { service } = buildService({ status: "ACTIVE", plan: "STARTER", isGrandfathered: false });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("GRANTED");
    if (state.access === "GRANTED") expect(state.plan.plan).toBe("STARTER");
  });

  it("PAST_DUE still grants full access — never destroy access on one failed payment", async () => {
    const { service } = buildService({ status: "PAST_DUE", plan: "BUSINESS", isGrandfathered: false });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("GRANTED");
  });

  it("EXPIRED is RESTRICTED", async () => {
    const { service } = buildService({ status: "EXPIRED", plan: "PROFESSIONAL", isGrandfathered: false });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("RESTRICTED");
  });

  it("CANCELED is RESTRICTED", async () => {
    const { service } = buildService({ status: "CANCELED", plan: "STARTER", isGrandfathered: false });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("RESTRICTED");
  });

  it("a grandfathered subscription always grants access at its assigned plan, regardless of status quirks", async () => {
    const { service } = buildService({ status: "ACTIVE", plan: "PROFESSIONAL", isGrandfathered: true });
    const state = await service.getEntitlementState("t1");
    expect(state.access).toBe("GRANTED");
  });

  describe("requireFeature", () => {
    it("throws a FEATURE-typed EntitlementDeniedException naming the lowest plan that unlocks it", async () => {
      const { service } = buildService({ status: "ACTIVE", plan: "STARTER", isGrandfathered: false });
      await expect(service.requireFeature("t1", "PAYMENTS_DEBT_MANAGEMENT")).rejects.toMatchObject({
        reason: { type: "FEATURE", feature: "PAYMENTS_DEBT_MANAGEMENT", availableFromPlan: "BUSINESS" },
      });
    });

    it("does not throw when the plan includes the feature", async () => {
      const { service } = buildService({ status: "ACTIVE", plan: "BUSINESS", isGrandfathered: false });
      await expect(service.requireFeature("t1", "PAYMENTS_DEBT_MANAGEMENT")).resolves.toBeUndefined();
    });

    it("throws TRIAL_EXPIRED for an expired trial rather than a generic denial", async () => {
      const { service } = buildService({ status: "EXPIRED", plan: "PROFESSIONAL", isGrandfathered: false });
      await expect(service.requireFeature("t1", "FINANCIAL_REPORTS")).rejects.toMatchObject({
        reason: { type: "TRIAL_EXPIRED" },
      });
    });
  });
});
