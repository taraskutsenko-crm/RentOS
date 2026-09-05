import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { BillingInterval, HavelioPlan, PromoCode } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { STRIPE_PROVIDER, type IStripeProvider } from "./billing.types";
import { getPriceMinor } from "./plan-config";

export interface PromoCodeValidationResult {
  promoCode: PromoCode;
  stripePromotionCodeId: string;
}

export interface DiscountPreview {
  code: string;
  currency: string;
  originalPriceMinor: number;
  discountedPriceMinor: number;
  /** Price once the discount stops applying — always shown, "never hide when the discount ends" (see docs/DECISIONS.md). Equal to originalPriceMinor for a FOREVER-duration code. */
  thenPriceMinor: number;
  duration: PromoCode["duration"];
  durationInMonths: number | null;
}

/**
 * Havelio Billing (Stage 17) promo-code domain — local metadata + validation
 * for a Stripe Coupon/Promotion Code (see PromoCode's own doc comment in
 * schema.prisma). Stripe itself is the system of record for the actual
 * discount mechanics; this service only ever validates and reads local
 * rows, never fabricates a discount Stripe doesn't know about.
 */
@Injectable()
export class PromoCodesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_PROVIDER) private readonly stripeProvider: IStripeProvider,
  ) {}

  async findByCode(code: string): Promise<PromoCode | null> {
    return this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  }

  /**
   * Provisions the real Stripe Coupon + Promotion Code backing a Havelio
   * PromoCode's customer discount — see PromoCode.provisioningStatus's own
   * doc comment for the full contract. Called once right after
   * AffiliatePartnersService.createPromoCode inserts the local row, and
   * again by retryProvisioning for a previously-FAILED code. Safe to call
   * repeatedly: each Stripe call carries an idempotency key derived from
   * this PromoCode's own (stable) id, and each of the two steps is skipped
   * once its ID is already saved — so a partial failure (Coupon created,
   * PromotionCode creation failed) resumes at exactly the step that didn't
   * complete, never re-creating the Coupon.
   *
   * Leaves the row untouched at PENDING (never fabricates PROVISIONED) when
   * Stripe isn't configured in this environment — see
   * docs/DECISIONS.md "never fake a successful checkout/subscription/
   * cancellation/refund/webhook delivery", applied here to provisioning.
   */
  async provisionStripeObjects(promoCode: PromoCode): Promise<PromoCode> {
    if (!this.stripeProvider.isConfigured()) {
      return promoCode;
    }

    try {
      let current = promoCode;

      if (!current.stripeCouponId) {
        const coupon = await this.stripeProvider.createCoupon({
          idempotencyKey: `havelio-promo-coupon-${current.id}`,
          ...(current.discountType === "PERCENTAGE" && current.discountValueBp !== null
            ? { percentOffBp: current.discountValueBp }
            : {}),
          ...(current.discountType === "FIXED_AMOUNT" && current.discountValueMinor !== null
            ? { amountOffMinor: current.discountValueMinor, currency: current.currency ?? "USD" }
            : {}),
          duration: current.duration,
          durationInMonths: current.durationInMonths,
        });
        current = await this.prisma.promoCode.update({
          where: { id: current.id },
          data: { stripeCouponId: coupon.id },
        });
      }

      if (!current.stripePromotionCodeId) {
        const promotionCode = await this.stripeProvider.createPromotionCode({
          idempotencyKey: `havelio-promo-code-${current.id}`,
          code: current.code,
          stripeCouponId: current.stripeCouponId!,
          maxRedemptions: current.maxRedemptions,
        });
        current = await this.prisma.promoCode.update({
          where: { id: current.id },
          data: { stripePromotionCodeId: promotionCode.id },
        });
      }

      return await this.prisma.promoCode.update({
        where: { id: current.id },
        data: { provisioningStatus: "PROVISIONED", provisioningError: null },
      });
    } catch (error) {
      // Never a raw Stripe error object (could carry request internals) —
      // just its message, truncated, truthfully surfaced to the admin.
      const message = error instanceof Error ? error.message : "Unknown Stripe provisioning error.";
      return this.prisma.promoCode.update({
        where: { id: promoCode.id },
        data: { provisioningStatus: "FAILED", provisioningError: message.slice(0, 500) },
      });
    }
  }

  /** Re-attempts provisioning for a PromoCode currently PENDING or FAILED — the admin-facing recovery path (see provisionStripeObjects's own doc comment for why this is always safe to call again). */
  async retryProvisioning(id: string): Promise<PromoCode> {
    const promoCode = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!promoCode) {
      throw new NotFoundException("Promotion code not found.");
    }
    if (promoCode.provisioningStatus === "PROVISIONED") {
      return promoCode;
    }
    return this.provisionStripeObjects(promoCode);
  }

  /**
   * Full V1 eligibility check, re-run at checkout time even if the code was
   * already validated once at signup (see docs/DECISIONS.md "discount
   * eligibility must be checked again at checkout"). Throws a
   * BadRequestException with a specific, user-facing reason on any
   * ineligibility — callers surface this directly, never a generic 400.
   */
  async validateForCheckout(
    code: string,
    tenantId: string,
    plan: Exclude<HavelioPlan, "ENTERPRISE">,
    interval: BillingInterval,
  ): Promise<PromoCodeValidationResult> {
    const promoCode = await this.findByCode(code);
    if (!promoCode) {
      throw new NotFoundException("This promotion code doesn't exist.");
    }
    this.assertEligible(promoCode, plan, interval);

    if (promoCode.firstTimeCustomerOnly) {
      const subscription = await this.prisma.havelioSubscription.findUnique({ where: { tenantId } });
      if (subscription?.stripeCustomerId) {
        throw new BadRequestException("This promotion code is only valid for new customers.");
      }
    }

    if (!promoCode.stripePromotionCodeId) {
      throw new BadRequestException(
        "This promotion code has no configured discount yet and cannot be applied at checkout.",
      );
    }

    return { promoCode, stripePromotionCodeId: promoCode.stripePromotionCodeId };
  }

  /**
   * Lighter-weight eligibility check used at signup/onboarding time (before
   * any checkout exists) — validates everything except the
   * first-time-customer/checkout-specific rules, since a brand-new trial
   * tenant is by definition eligible on those. Used by
   * AffiliateAttributionService.recordFromPromoCode.
   */
  async validateForAttribution(code: string): Promise<PromoCode> {
    const promoCode = await this.findByCode(code);
    if (!promoCode) {
      throw new NotFoundException("This promotion code doesn't exist.");
    }
    if (!promoCode.isActive) {
      throw new BadRequestException("This promotion code is no longer active.");
    }
    const now = new Date();
    if (promoCode.validFrom && promoCode.validFrom > now) {
      throw new BadRequestException("This promotion code is not valid yet.");
    }
    if (promoCode.validUntil && promoCode.validUntil < now) {
      throw new BadRequestException("This promotion code has expired.");
    }
    return promoCode;
  }

  private assertEligible(
    promoCode: PromoCode,
    plan: Exclude<HavelioPlan, "ENTERPRISE">,
    interval: BillingInterval,
  ): void {
    if (!promoCode.isActive) {
      throw new BadRequestException("This promotion code is no longer active.");
    }
    const now = new Date();
    if (promoCode.validFrom && promoCode.validFrom > now) {
      throw new BadRequestException("This promotion code is not valid yet.");
    }
    if (promoCode.validUntil && promoCode.validUntil < now) {
      throw new BadRequestException("This promotion code has expired.");
    }
    if (promoCode.maxRedemptions !== null && promoCode.redemptionCount >= promoCode.maxRedemptions) {
      throw new BadRequestException("This promotion code has reached its redemption limit.");
    }
    if (promoCode.eligiblePlans.length > 0 && !promoCode.eligiblePlans.includes(plan)) {
      throw new BadRequestException("This promotion code is not valid for the selected plan.");
    }
    if (promoCode.eligibleInterval && promoCode.eligibleInterval !== interval) {
      throw new BadRequestException(
        `This promotion code is only valid for ${promoCode.eligibleInterval === "ANNUAL" ? "annual" : "monthly"} billing.`,
      );
    }
  }

  /** Called once a checkout genuinely completes with this code applied (see SubscriptionsService.handleCheckoutSessionCompleted). */
  async incrementRedemptionCount(promoCodeId: string): Promise<void> {
    await this.prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { redemptionCount: { increment: 1 } },
    });
  }

  /**
   * Transparent, non-committing discount preview for the Billing UI — "Today:
   * €55.20/month for the first 3 months. Then: €69/month." (see
   * docs/DECISIONS.md "never hide when the discount ends"). Runs the same
   * eligibility checks as `validateForCheckout` (minus the
   * Stripe-linkage/first-time-customer checks, which need a real checkout
   * context) so an ineligible code is never previewed as if it would apply.
   */
  async previewDiscount(
    code: string,
    plan: Exclude<HavelioPlan, "ENTERPRISE">,
    interval: BillingInterval,
  ): Promise<DiscountPreview> {
    const promoCode = await this.findByCode(code);
    if (!promoCode) {
      throw new NotFoundException("This promotion code doesn't exist.");
    }
    this.assertEligible(promoCode, plan, interval);

    const originalPriceMinor = getPriceMinor(plan, interval);
    if (originalPriceMinor === null) {
      throw new BadRequestException("This plan has no self-service price.");
    }

    let discountedPriceMinor = originalPriceMinor;
    if (promoCode.discountType === "PERCENTAGE" && promoCode.discountValueBp !== null) {
      discountedPriceMinor =
        originalPriceMinor - Math.round((originalPriceMinor * promoCode.discountValueBp) / 10000);
    } else if (promoCode.discountType === "FIXED_AMOUNT" && promoCode.discountValueMinor !== null) {
      if (promoCode.currency && promoCode.currency !== "USD") {
        throw new BadRequestException("This promotion code's currency does not match this plan.");
      }
      discountedPriceMinor = Math.max(0, originalPriceMinor - promoCode.discountValueMinor);
    }

    return {
      code: promoCode.code,
      currency: "USD",
      originalPriceMinor,
      discountedPriceMinor,
      thenPriceMinor: promoCode.duration === "FOREVER" ? discountedPriceMinor : originalPriceMinor,
      duration: promoCode.duration,
      durationInMonths: promoCode.durationInMonths,
    };
  }
}
