import type { BillingInterval, HavelioPlan } from "@prisma/client";

/**
 * Havelio Billing (Stage 17) — the ONE canonical, backend-only source of
 * truth for plan pricing and entitlements. Never scatter
 * `if (plan === "BUSINESS")` checks around the frontend/backend — every
 * consumer (the public plan-list endpoint, checkout, EntitlementsService,
 * the Billing settings page) reads from this module or the API endpoint
 * that serves it. This mirrors the same "one canonical source, reused
 * everywhere" principle as ReceivablesService/derivePaymentStatus for
 * RENTAL FINANCE — see docs/DECISIONS.md.
 *
 * Money is always integer minor units (cents) — never a JS float. Percent
 * values are always integer basis points (2000 = 20%).
 *
 * IMPORTANT — Stage 17 domain boundary: this module prices HAVELIO's own
 * subscription product (what a tenant company pays Havelio to use the
 * product). It has nothing to do with RENTAL FINANCE (Invoice/Payment —
 * what a tenant's own rental customers pay the tenant).
 */

/** A feature flag gated by HavelioSubscription.plan — see EntitlementsService. */
export type HavelioFeature =
  | "ELECTRONIC_SIGNATURES"
  | "PAYMENTS_DEBT_MANAGEMENT"
  | "PAYMENT_DEMANDS"
  | "FINANCIAL_REPORTS"
  | "CUSTOMER_PORTAL"
  | "ADVANCED_REPORTING"
  | "ENHANCED_DOCUMENTS";

export interface PlanLimits {
  /** Max ACTIVE memberships (status="ACTIVE") a tenant may have. `null` = no cap. */
  maxUsers: number | null;
  /**
   * Max assets not in a terminal/retired state ("active" = every Asset row
   * that still counts against the plan — see EntitlementsService.countActiveAssets
   * for the exact query). `null` = no practical cap (PROFESSIONAL/ENTERPRISE).
   */
  maxActiveAssets: number | null;
  /** Max rental-business locations. Only STARTER is capped at 1 in V1 — no multi-location feature exists yet. */
  maxLocations: number | null;
}

export interface PlanDefinition {
  plan: HavelioPlan;
  /** Display name shown in plan-comparison / upgrade UI. */
  name: string;
  /** Monthly price in minor units (cents). `null` for ENTERPRISE — Contact Sales only, no self-service price. */
  monthlyPriceMinor: number | null;
  /** Annual price in minor units — `monthlyPriceMinor * 12 * 0.8`, rounded. `null` for ENTERPRISE. */
  annualPriceMinor: number | null;
  currency: "EUR";
  limits: PlanLimits;
  /** Features this plan unlocks — see HavelioFeature. */
  features: HavelioFeature[];
  /** Shown as "MOST POPULAR" in public/upgrade UI — BUSINESS only, per V1 commercial decision. */
  isMostPopular: boolean;
  /** ENTERPRISE only — no self-service Stripe Checkout; the Billing page shows "Contact Sales" instead of a price/checkout button. */
  isContactSalesOnly: boolean;
}

/**
 * Annual pricing = 20% off 12 monthly payments, per the fixed V1 commercial
 * model (never a separately-typed number — always derived from the monthly
 * price so the two can never silently drift). Integer-cents arithmetic only:
 * `monthlyMinor * 12 * 80` is always exactly divisible by 100 for every
 * plan price actually used in V1 (29/69/149 EUR), so `Math.round` here is a
 * defensive no-op, not a source of rounding error — verified in
 * plan-config.spec.ts.
 */
function annualFromMonthly(monthlyMinor: number): number {
  return Math.round((monthlyMinor * 12 * 80) / 100);
}

const BUSINESS_FEATURES: HavelioFeature[] = [
  "ELECTRONIC_SIGNATURES",
  "PAYMENTS_DEBT_MANAGEMENT",
  "PAYMENT_DEMANDS",
  "FINANCIAL_REPORTS",
  "CUSTOMER_PORTAL",
  "ADVANCED_REPORTING",
  "ENHANCED_DOCUMENTS",
];

const STARTER_MONTHLY_MINOR = 2900;
const BUSINESS_MONTHLY_MINOR = 6900;
const PROFESSIONAL_MONTHLY_MINOR = 14900;

/**
 * Every real V1 plan, in display order. ENTERPRISE deliberately has no
 * price/limits/features populated beyond "everything PROFESSIONAL has" —
 * see docs/DECISIONS.md "do not pretend enterprise functionality exists
 * when it doesn't"; real Enterprise deals are negotiated by Havelio staff
 * outside this system.
 */
export const PLAN_DEFINITIONS: Record<HavelioPlan, PlanDefinition> = {
  STARTER: {
    plan: "STARTER",
    name: "Starter",
    monthlyPriceMinor: STARTER_MONTHLY_MINOR,
    annualPriceMinor: annualFromMonthly(STARTER_MONTHLY_MINOR),
    currency: "EUR",
    limits: { maxUsers: 2, maxActiveAssets: 50, maxLocations: 1 },
    features: [],
    isMostPopular: false,
    isContactSalesOnly: false,
  },
  BUSINESS: {
    plan: "BUSINESS",
    name: "Business",
    monthlyPriceMinor: BUSINESS_MONTHLY_MINOR,
    annualPriceMinor: annualFromMonthly(BUSINESS_MONTHLY_MINOR),
    currency: "EUR",
    limits: { maxUsers: 5, maxActiveAssets: 500, maxLocations: 1 },
    features: BUSINESS_FEATURES,
    isMostPopular: true,
    isContactSalesOnly: false,
  },
  PROFESSIONAL: {
    plan: "PROFESSIONAL",
    name: "Professional",
    monthlyPriceMinor: PROFESSIONAL_MONTHLY_MINOR,
    annualPriceMinor: annualFromMonthly(PROFESSIONAL_MONTHLY_MINOR),
    currency: "EUR",
    // "Unlimited/high practical asset limit" per spec — modeled as `null`
    // (no cap enforced), not a large-but-fake number.
    limits: { maxUsers: 15, maxActiveAssets: null, maxLocations: null },
    // Everything Business has. Multi-location/warehouses, advanced RBAC,
    // API/Webhooks, advanced analytics, advanced customization, and
    // priority support are FUTURE entitlements named in the product
    // direction but not yet built — deliberately absent from this array
    // (never advertised as available; see docs/DECISIONS.md).
    features: BUSINESS_FEATURES,
    isMostPopular: false,
    isContactSalesOnly: false,
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceMinor: null,
    annualPriceMinor: null,
    currency: "EUR",
    limits: { maxUsers: null, maxActiveAssets: null, maxLocations: null },
    features: BUSINESS_FEATURES,
    isMostPopular: false,
    isContactSalesOnly: true,
  },
};

export const ORDERED_PLANS: HavelioPlan[] = ["STARTER", "BUSINESS", "PROFESSIONAL", "ENTERPRISE"];

export function getPlanDefinition(plan: HavelioPlan): PlanDefinition {
  return PLAN_DEFINITIONS[plan];
}

/** Price in minor units for a given plan + billing interval. `null` when the plan has no self-service price (ENTERPRISE). */
export function getPriceMinor(plan: HavelioPlan, interval: BillingInterval): number | null {
  const definition = PLAN_DEFINITIONS[plan];
  return interval === "ANNUAL" ? definition.annualPriceMinor : definition.monthlyPriceMinor;
}

/** Trial length — fixed at 14 days for V1, server-authoritative (see SubscriptionsService.startTrial). */
export const TRIAL_DURATION_DAYS = 14;

export function planHasFeature(plan: HavelioPlan, feature: HavelioFeature): boolean {
  return PLAN_DEFINITIONS[plan].features.includes(feature);
}
