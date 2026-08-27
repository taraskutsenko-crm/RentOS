import type { HelmetOptions } from "helmet";

/**
 * Shared between main.ts (production bootstrap) and test/test-app.ts (the
 * e2e test harness) so the two never drift — the CORP misconfiguration
 * this fixes was invisible precisely because the e2e harness didn't apply
 * helmet at all, so no test could have caught it. See main.ts's inline
 * comment for the full rationale.
 */
export const HELMET_OPTIONS: HelmetOptions = {
  crossOriginResourcePolicy: { policy: "cross-origin" },
};
