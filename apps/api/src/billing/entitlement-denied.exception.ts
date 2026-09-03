import { ForbiddenException } from "@nestjs/common";
import type { HavelioPlan } from "@prisma/client";

import type { HavelioFeature } from "./plan-config";

/**
 * Why an entitlement check failed — never a generic 403 (see
 * docs/DECISIONS.md). The exception body carries BOTH a real, human-
 * readable `message` (so every existing call site's generic error-display
 * path — `apiErrorMessage()` — already shows something useful with zero
 * per-call-site changes) AND the structured `code`/`reason` (so a
 * call site that wants richer upgrade UX — a "Compare plans"/"Upgrade"
 * button, an "Assets 48/50" style limit display — can build one later by
 * reading `error.details.reason` off the thrown `ApiError`). Only the
 * Billing settings page itself builds that richer UI today (disabled
 * "Choose plan" buttons/tooltips) — see docs/HANDOVER.md's remaining-gaps
 * note for full call-site wiring across every gated feature.
 */
export type EntitlementDenialReason =
  | { type: "FEATURE"; feature: HavelioFeature; availableFromPlan: HavelioPlan }
  | { type: "LIMIT"; resource: "assets" | "users"; current: number; limit: number }
  | { type: "TRIAL_EXPIRED" }
  | { type: "SUBSCRIPTION_INACTIVE" };

function describe(reason: EntitlementDenialReason): string {
  switch (reason.type) {
    case "FEATURE":
      return `This feature is available on the ${reason.availableFromPlan} plan. Upgrade to unlock it.`;
    case "LIMIT":
      return `You've reached your plan's limit of ${reason.limit} ${reason.resource} (currently ${reason.current}/${reason.limit}). Upgrade your plan to add more.`;
    case "TRIAL_EXPIRED":
      return "Your Havelio trial has ended. Choose a plan to continue.";
    case "SUBSCRIPTION_INACTIVE":
      return "This action requires an active Havelio subscription.";
  }
}

export class EntitlementDeniedException extends ForbiddenException {
  constructor(public readonly reason: EntitlementDenialReason) {
    super({ code: "ENTITLEMENT_DENIED", message: describe(reason), reason });
  }
}
