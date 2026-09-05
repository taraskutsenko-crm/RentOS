import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BillingInterval, HavelioPlan, PromoCode } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
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
  constructor(private readonly prisma: PrismaService) {}

  async findByCode(code: string): Promise<PromoCode | null> {
    return this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
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
