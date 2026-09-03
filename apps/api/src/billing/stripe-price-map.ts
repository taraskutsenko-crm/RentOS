import type { ConfigService } from "@nestjs/config";
import type { BillingInterval, HavelioPlan } from "@prisma/client";
import type { ApiEnv } from "@rentos/shared";

/**
 * Deterministic Havelio-plan + billing-interval -> Stripe Price ID mapping,
 * read from configured env vars — never a dynamically-created Price at
 * runtime (see docs/DECISIONS.md "do not dynamically create duplicate
 * Stripe products/prices on every runtime"). Production Stripe Products/
 * Prices must be created once, out-of-band (Stripe Dashboard or a one-time
 * provisioning script), and their real Price IDs (`price_...`) set as
 * STRIPE_PRICE_<PLAN>_<INTERVAL> — see packages/shared/src/env.ts and
 * docs/DECISIONS.md for the exact provisioning instructions.
 *
 * ENTERPRISE is never looked up here — it has no self-service checkout in V1.
 */
export function getPriceId(
  configService: ConfigService<ApiEnv, true>,
  plan: Exclude<HavelioPlan, "ENTERPRISE">,
  interval: BillingInterval,
): string | undefined {
  const key = `STRIPE_PRICE_${plan}_${interval === "ANNUAL" ? "ANNUAL" : "MONTHLY"}` as
    | "STRIPE_PRICE_STARTER_MONTHLY"
    | "STRIPE_PRICE_STARTER_ANNUAL"
    | "STRIPE_PRICE_BUSINESS_MONTHLY"
    | "STRIPE_PRICE_BUSINESS_ANNUAL"
    | "STRIPE_PRICE_PROFESSIONAL_MONTHLY"
    | "STRIPE_PRICE_PROFESSIONAL_ANNUAL";
  return configService.get(key, { infer: true });
}

const SELF_SERVICE_PLANS: Exclude<HavelioPlan, "ENTERPRISE">[] = ["STARTER", "BUSINESS", "PROFESSIONAL"];
const INTERVALS: BillingInterval[] = ["MONTHLY", "ANNUAL"];

/**
 * Reverse lookup: given a real Stripe Price ID (as reported on a webhook's
 * Subscription object), find which Havelio plan+interval it corresponds to.
 * Used by SubscriptionsService to sync `HavelioSubscription.plan`/
 * `billingInterval` from Stripe's own authoritative subscription state —
 * never trusts the Checkout Session's original `metadata.plan` alone, since
 * the tenant could have since upgraded/downgraded directly via a later
 * webhook.
 */
export function reversePriceLookup(
  configService: ConfigService<ApiEnv, true>,
  stripePriceId: string,
): { plan: Exclude<HavelioPlan, "ENTERPRISE">; interval: BillingInterval } | null {
  for (const plan of SELF_SERVICE_PLANS) {
    for (const interval of INTERVALS) {
      if (getPriceId(configService, plan, interval) === stripePriceId) {
        return { plan, interval };
      }
    }
  }
  return null;
}
