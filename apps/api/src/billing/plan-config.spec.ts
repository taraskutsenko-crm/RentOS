import { describe, expect, it } from "vitest";

import { getPlanDefinition, getPriceMinor, planHasFeature, PLAN_DEFINITIONS } from "./plan-config";

describe("plan-config", () => {
  describe("annual pricing (20% off 12 monthly payments)", () => {
    it("Starter: 29 x 12 x 0.80 = 278.40 EUR", () => {
      expect(getPriceMinor("STARTER", "MONTHLY")).toBe(2900);
      expect(getPriceMinor("STARTER", "ANNUAL")).toBe(27840);
    });

    it("Business: 69 x 12 x 0.80 = 662.40 EUR", () => {
      expect(getPriceMinor("BUSINESS", "MONTHLY")).toBe(6900);
      expect(getPriceMinor("BUSINESS", "ANNUAL")).toBe(66240);
    });

    it("Professional: 149 x 12 x 0.80 = 1,430.40 EUR", () => {
      expect(getPriceMinor("PROFESSIONAL", "MONTHLY")).toBe(14900);
      expect(getPriceMinor("PROFESSIONAL", "ANNUAL")).toBe(143040);
    });

    it("Enterprise has no self-service price", () => {
      expect(getPriceMinor("ENTERPRISE", "MONTHLY")).toBeNull();
      expect(getPriceMinor("ENTERPRISE", "ANNUAL")).toBeNull();
    });
  });

  it("exactly one plan is marked MOST POPULAR: Business", () => {
    const mostPopular = Object.values(PLAN_DEFINITIONS).filter((p) => p.isMostPopular);
    expect(mostPopular).toHaveLength(1);
    expect(mostPopular[0]?.plan).toBe("BUSINESS");
  });

  it("only Enterprise is Contact-Sales-only", () => {
    for (const definition of Object.values(PLAN_DEFINITIONS)) {
      expect(definition.isContactSalesOnly).toBe(definition.plan === "ENTERPRISE");
    }
  });

  describe("entitlements", () => {
    it("Starter: 1 location, 2 users, 50 assets, no Business/Professional features", () => {
      const starter = getPlanDefinition("STARTER");
      expect(starter.limits).toEqual({ maxUsers: 2, maxActiveAssets: 50, maxLocations: 1 });
      expect(starter.features).toEqual([]);
      expect(planHasFeature("STARTER", "PAYMENTS_DEBT_MANAGEMENT")).toBe(false);
    });

    it("Business: 5 users, 500 assets, unlocks signatures/payments/reports/portal", () => {
      const business = getPlanDefinition("BUSINESS");
      expect(business.limits).toEqual({ maxUsers: 5, maxActiveAssets: 500, maxLocations: 1 });
      expect(planHasFeature("BUSINESS", "ELECTRONIC_SIGNATURES")).toBe(true);
      expect(planHasFeature("BUSINESS", "PAYMENTS_DEBT_MANAGEMENT")).toBe(true);
      expect(planHasFeature("BUSINESS", "FINANCIAL_REPORTS")).toBe(true);
      expect(planHasFeature("BUSINESS", "CUSTOMER_PORTAL")).toBe(true);
    });

    it("Professional: 15 users, unlimited assets, everything Business has", () => {
      const professional = getPlanDefinition("PROFESSIONAL");
      expect(professional.limits.maxUsers).toBe(15);
      expect(professional.limits.maxActiveAssets).toBeNull();
      for (const feature of getPlanDefinition("BUSINESS").features) {
        expect(planHasFeature("PROFESSIONAL", feature)).toBe(true);
      }
    });

    it("Enterprise has no enforced numeric limits (negotiated custom)", () => {
      const enterprise = getPlanDefinition("ENTERPRISE");
      expect(enterprise.limits).toEqual({ maxUsers: null, maxActiveAssets: null, maxLocations: null });
    });
  });
});
