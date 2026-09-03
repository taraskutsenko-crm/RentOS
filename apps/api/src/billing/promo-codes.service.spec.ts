import { describe, expect, it, vi } from "vitest";

import { PromoCodesService } from "./promo-codes.service";

function buildService(promoCode: Record<string, unknown> | null) {
  const prisma = {
    promoCode: { findUnique: vi.fn().mockResolvedValue(promoCode) },
    havelioSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const service = new PromoCodesService(prisma as never);
  return { service, prisma };
}

const BASE_CODE = {
  id: "promo-1",
  code: "RENTAL20",
  discountType: "PERCENTAGE",
  discountValueBp: 2000,
  discountValueMinor: null,
  currency: null,
  duration: "REPEATING",
  durationInMonths: 3,
  isActive: true,
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
  redemptionCount: 0,
  firstTimeCustomerOnly: true,
  eligiblePlans: [],
  eligibleInterval: null,
  stripeCouponId: "coupon_1",
  stripePromotionCodeId: "promo_1",
  affiliateCampaignId: null,
};

describe("PromoCodesService", () => {
  describe("previewDiscount — exact money math, task's own worked example", () => {
    it("Business €69/month, RENTAL20 -20% => €55.20/month for first 3 months, then €69/month", async () => {
      const { service } = buildService(BASE_CODE);
      const preview = await service.previewDiscount("RENTAL20", "BUSINESS", "MONTHLY");

      expect(preview.originalPriceMinor).toBe(6900);
      expect(preview.discountedPriceMinor).toBe(5520);
      expect(preview.thenPriceMinor).toBe(6900);
      expect(preview.duration).toBe("REPEATING");
      expect(preview.durationInMonths).toBe(3);
    });

    it("FOREVER duration: thenPrice equals the discounted price (discount never ends)", async () => {
      const { service } = buildService({ ...BASE_CODE, duration: "FOREVER", durationInMonths: null });
      const preview = await service.previewDiscount("RENTAL20", "STARTER", "MONTHLY");
      expect(preview.thenPriceMinor).toBe(preview.discountedPriceMinor);
    });

    it("FIXED_AMOUNT discount subtracts exact minor units", async () => {
      const { service } = buildService({
        ...BASE_CODE,
        discountType: "FIXED_AMOUNT",
        discountValueBp: null,
        discountValueMinor: 1000,
        currency: "EUR",
      });
      const preview = await service.previewDiscount("RENTAL20", "STARTER", "MONTHLY");
      expect(preview.originalPriceMinor).toBe(2900);
      expect(preview.discountedPriceMinor).toBe(1900);
    });
  });

  describe("eligibility", () => {
    it("rejects an inactive code", async () => {
      const { service } = buildService({ ...BASE_CODE, isActive: false });
      await expect(service.previewDiscount("RENTAL20", "BUSINESS", "MONTHLY")).rejects.toThrow(
        /no longer active/,
      );
    });

    it("rejects a code not eligible for the selected plan", async () => {
      const { service } = buildService({ ...BASE_CODE, eligiblePlans: ["PROFESSIONAL"] });
      await expect(service.previewDiscount("RENTAL20", "STARTER", "MONTHLY")).rejects.toThrow(
        /not valid for the selected plan/,
      );
    });

    it("rejects a code past its redemption limit", async () => {
      const { service } = buildService({ ...BASE_CODE, maxRedemptions: 5, redemptionCount: 5 });
      await expect(service.previewDiscount("RENTAL20", "BUSINESS", "MONTHLY")).rejects.toThrow(
        /redemption limit/,
      );
    });

    it("rejects an unknown code", async () => {
      const { service } = buildService(null);
      await expect(service.previewDiscount("NOPE", "BUSINESS", "MONTHLY")).rejects.toThrow(
        /doesn't exist/,
      );
    });

    it("validateForCheckout rejects a code with no Stripe linkage — never fabricates a discount", async () => {
      const { service } = buildService({ ...BASE_CODE, stripePromotionCodeId: null });
      await expect(
        service.validateForCheckout("RENTAL20", "tenant-1", "BUSINESS", "MONTHLY"),
      ).rejects.toThrow(/no configured discount/);
    });

    it("validateForCheckout rejects a first-time-customer code for a tenant with an existing Stripe customer", async () => {
      const { service, prisma } = buildService(BASE_CODE);
      prisma.havelioSubscription.findUnique.mockResolvedValue({ stripeCustomerId: "cus_existing" });
      await expect(
        service.validateForCheckout("RENTAL20", "tenant-1", "BUSINESS", "MONTHLY"),
      ).rejects.toThrow(/only valid for new customers/);
    });
  });
});
