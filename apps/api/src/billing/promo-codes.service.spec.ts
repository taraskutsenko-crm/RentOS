import { describe, expect, it, vi } from "vitest";

import { PromoCodesService } from "./promo-codes.service";

function buildService(promoCode: Record<string, unknown> | null, stripeProviderOverrides: Record<string, unknown> = {}) {
  // Mutable so sequential updates within one provisionStripeObjects call
  // (stripeCouponId, then stripePromotionCodeId, then provisioningStatus)
  // correctly accumulate — mirroring real Prisma row-update semantics
  // rather than each call re-merging onto the original stale snapshot.
  let row = promoCode ? { ...promoCode } : null;
  const prisma = {
    promoCode: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(row)),
      update: vi.fn().mockImplementation(({ data }) => {
        row = { ...row, ...data };
        return Promise.resolve(row);
      }),
    },
    havelioSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const stripeProvider = {
    isConfigured: vi.fn().mockReturnValue(true),
    createCoupon: vi.fn().mockResolvedValue({ id: "coupon_new" }),
    createPromotionCode: vi.fn().mockResolvedValue({ id: "promo_new" }),
    ...stripeProviderOverrides,
  };
  const service = new PromoCodesService(prisma as never, stripeProvider as never);
  return { service, prisma, stripeProvider };
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
        currency: "USD",
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

  describe("provisionStripeObjects — real Stripe Coupon/Promotion Code provisioning", () => {
    const UNPROVISIONED = {
      ...BASE_CODE,
      stripeCouponId: null,
      stripePromotionCodeId: null,
      provisioningStatus: "PENDING",
      provisioningError: null,
    };

    it("creates both the Coupon and Promotion Code, using idempotency keys derived from the PromoCode's own id, and marks PROVISIONED", async () => {
      const { service, stripeProvider } = buildService(UNPROVISIONED);
      const result = await service.provisionStripeObjects(UNPROVISIONED as never);

      expect(stripeProvider.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `havelio-promo-coupon-${BASE_CODE.id}`,
          percentOffBp: 2000,
          duration: "REPEATING",
          durationInMonths: 3,
        }),
      );
      expect(stripeProvider.createPromotionCode).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `havelio-promo-code-${BASE_CODE.id}`,
          code: "RENTAL20",
          stripeCouponId: "coupon_new",
        }),
      );
      expect(result.stripeCouponId).toBe("coupon_new");
      expect(result.stripePromotionCodeId).toBe("promo_new");
      expect(result.provisioningStatus).toBe("PROVISIONED");
      expect(result.provisioningError).toBeNull();
    });

    it("leaves the code PENDING (never fabricates PROVISIONED) when Stripe isn't configured", async () => {
      const { service, stripeProvider } = buildService(UNPROVISIONED, { isConfigured: vi.fn().mockReturnValue(false) });
      const result = await service.provisionStripeObjects(UNPROVISIONED as never);

      expect(stripeProvider.createCoupon).not.toHaveBeenCalled();
      expect(result.provisioningStatus).toBe("PENDING");
    });

    it("resumes at the Promotion Code step without re-creating the Coupon, when the Coupon already exists from a prior partial attempt", async () => {
      const partiallyProvisioned = { ...UNPROVISIONED, stripeCouponId: "coupon_existing" };
      const { service, stripeProvider } = buildService(partiallyProvisioned);
      const result = await service.provisionStripeObjects(partiallyProvisioned as never);

      expect(stripeProvider.createCoupon).not.toHaveBeenCalled();
      expect(stripeProvider.createPromotionCode).toHaveBeenCalledWith(
        expect.objectContaining({ stripeCouponId: "coupon_existing" }),
      );
      expect(result.stripeCouponId).toBe("coupon_existing");
      expect(result.provisioningStatus).toBe("PROVISIONED");
    });

    it("records a truthful FAILED status and error message, never a raw Stripe error object, when Promotion Code creation fails after the Coupon already succeeded", async () => {
      const { service } = buildService(UNPROVISIONED, {
        createPromotionCode: vi.fn().mockRejectedValue(new Error("A promotion code with this code already exists.")),
      });
      const result = await service.provisionStripeObjects(UNPROVISIONED as never);

      expect(result.provisioningStatus).toBe("FAILED");
      expect(result.provisioningError).toBe("A promotion code with this code already exists.");
      // The Coupon step already succeeded and must be preserved for a safe retry.
      expect(result.stripeCouponId).toBe("coupon_new");
      expect(result.stripePromotionCodeId).toBeNull();
    });

    it("retryProvisioning re-attempts a FAILED code and skips a code that's already PROVISIONED", async () => {
      const failed = { ...UNPROVISIONED, stripeCouponId: "coupon_existing", provisioningStatus: "FAILED" };
      const { service, stripeProvider } = buildService(failed);
      const result = await service.retryProvisioning(failed.id);

      expect(stripeProvider.createCoupon).not.toHaveBeenCalled();
      expect(stripeProvider.createPromotionCode).toHaveBeenCalled();
      expect(result.provisioningStatus).toBe("PROVISIONED");

      const { service: alreadyDoneService, stripeProvider: unusedProvider } = buildService({
        ...BASE_CODE,
        provisioningStatus: "PROVISIONED",
      });
      await alreadyDoneService.retryProvisioning(BASE_CODE.id);
      expect(unusedProvider.createCoupon).not.toHaveBeenCalled();
      expect(unusedProvider.createPromotionCode).not.toHaveBeenCalled();
    });
  });
});
