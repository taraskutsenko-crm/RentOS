import { Injectable } from "@nestjs/common";
import type { HavelioPlan, HavelioSubscription, Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { EntitlementDeniedException } from "./entitlement-denied.exception";
import {
  getPlanDefinition,
  ORDERED_PLANS,
  planHasFeature,
  type HavelioFeature,
  type PlanDefinition,
} from "./plan-config";
import { SubscriptionsService } from "./subscriptions.service";

export type EntitlementState =
  | { access: "GRANTED"; plan: PlanDefinition; subscription: HavelioSubscription }
  | { access: "RESTRICTED"; plan: null; subscription: HavelioSubscription };

/**
 * Havelio Billing (Stage 17) — the ONE place that turns a
 * HavelioSubscription row into an access decision. Never scatter
 * `if (plan === "PRO")` checks elsewhere — every feature gate and every
 * resource-limit check goes through this service.
 *
 * Access rules (V1, see docs/DECISIONS.md):
 *   - `isGrandfathered` (pre-existing tenants migrated at Stage 17 launch):
 *     always full access at their assigned plan, indefinitely.
 *   - TRIALING (not yet expired): full PROFESSIONAL-tier access — "full
 *     meaningful product evaluation," see SubscriptionsService.startTrial.
 *   - ACTIVE / PAST_DUE: access at the subscription's own plan. PAST_DUE
 *     deliberately still grants full access — "do not immediately destroy
 *     access on one failed payment" — only the Billing UI shows a truthful
 *     past-due warning; entitlements are unaffected until Stripe itself
 *     cancels the subscription (customer.subscription.deleted).
 *   - EXPIRED / CANCELED / INCOMPLETE: RESTRICTED — every mutating,
 *     business-operation endpoint this service gates is blocked; Billing/
 *     Settings/export/account-management endpoints are never gated by this
 *     service at all (see docs/DECISIONS.md — TenantGuard, not this
 *     service, is the only thing checking `tenant.isActive`).
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async getEntitlementState(tenantId: string): Promise<EntitlementState> {
    const subscription = await this.subscriptionsService.getSubscription(tenantId);

    if (subscription.isGrandfathered) {
      return { access: "GRANTED", plan: getPlanDefinition(subscription.plan), subscription };
    }

    switch (subscription.status) {
      case "TRIALING":
        return { access: "GRANTED", plan: getPlanDefinition("PROFESSIONAL"), subscription };
      case "ACTIVE":
      case "PAST_DUE":
        return { access: "GRANTED", plan: getPlanDefinition(subscription.plan), subscription };
      case "EXPIRED":
      case "CANCELED":
      case "INCOMPLETE":
      default:
        return { access: "RESTRICTED", plan: null, subscription };
    }
  }

  async hasFeature(tenantId: string, feature: HavelioFeature): Promise<boolean> {
    const state = await this.getEntitlementState(tenantId);
    return state.access === "GRANTED" && planHasFeature(state.plan.plan, feature);
  }

  /** The lowest-tier plan that unlocks `feature` — powers "This feature is available on Business." messaging. */
  private lowestPlanWithFeature(feature: HavelioFeature): HavelioPlan {
    const found = ORDERED_PLANS.find((plan) => planHasFeature(plan, feature));
    return found ?? "ENTERPRISE";
  }

  /** Throws EntitlementDeniedException (never a generic 403) when the tenant's current plan doesn't include `feature`. */
  async requireFeature(tenantId: string, feature: HavelioFeature): Promise<void> {
    const state = await this.getEntitlementState(tenantId);
    if (state.access !== "GRANTED") {
      throw new EntitlementDeniedException(
        state.subscription.status === "EXPIRED" ? { type: "TRIAL_EXPIRED" } : { type: "SUBSCRIPTION_INACTIVE" },
      );
    }
    if (!planHasFeature(state.plan.plan, feature)) {
      throw new EntitlementDeniedException({
        type: "FEATURE",
        feature,
        availableFromPlan: this.lowestPlanWithFeature(feature),
      });
    }
  }

  async countActiveAssets(tenantId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    return client.asset.count({ where: { tenantId, deletedAt: null, isActive: true } });
  }

  async countActiveUsers(tenantId: string, client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    return client.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } });
  }

  /**
   * Concurrency-safe asset-creation limit check — MUST be called from
   * inside the same Prisma transaction that inserts the new Asset row (see
   * AssetsService.create). Two simultaneous requests each starting their
   * own transaction cannot both pass a plain "count, then insert if under
   * limit" check (a classic TOCTOU race — see the "49 assets -> two
   * concurrent requests -> 51 assets" scenario this codebase's own spec
   * calls out) because each transaction only sees committed data from
   * outside itself. `pg_advisory_xact_lock`, keyed by tenantId, serializes
   * concurrent callers for the lock's duration: the first request to reach
   * this line acquires the lock and proceeds to count+insert+commit
   * (releasing the lock automatically at commit); every other concurrent
   * request blocks here until then, so by the time it re-runs the count it
   * always sees the first request's already-committed row. See
   * entitlements.service.spec.ts for a real-concurrency proof.
   */
  async assertCanCreateAsset(tenantId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || ':asset'))`;

    const state = await this.getEntitlementState(tenantId);
    if (state.access !== "GRANTED") {
      throw new EntitlementDeniedException(
        state.subscription.status === "EXPIRED" ? { type: "TRIAL_EXPIRED" } : { type: "SUBSCRIPTION_INACTIVE" },
      );
    }

    const limit = state.plan.limits.maxActiveAssets;
    if (limit === null) return;

    const current = await this.countActiveAssets(tenantId, tx);
    if (current >= limit) {
      throw new EntitlementDeniedException({ type: "LIMIT", resource: "assets", current, limit });
    }
  }
}
