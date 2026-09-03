"use client";

import { useToast } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { apiErrorMessage } from "../lib/api-error-i18n";
import { isEntitlementDeniedError } from "../lib/entitlement-error";

/**
 * Havelio Billing (Stage 17 closure pass) — call this ALONGSIDE (never
 * instead of) a page's existing inline error display. It is a deliberate
 * no-op for any ordinary error (validation, conflict, etc.) — only a real
 * `code: "ENTITLEMENT_DENIED"` response (see FeatureEntitlementGuard/
 * EntitlementDeniedException) fires a toast, with a "View plans" action
 * linking to Settings -> Billing and no auto-dismiss (an upgrade decision
 * shouldn't be missed to a 5-second timeout). This is how the five
 * Business-tier gated actions (Payments, Payment Demands, Financial
 * Reports, Customer Portal invites, Electronic Signature requests) surface
 * a useful, actionable notice instead of a generic 403 — see
 * docs/DECISIONS.md.
 */
export function useEntitlementErrorToast(): (error: unknown) => void {
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();

  return (error: unknown) => {
    if (!isEntitlementDeniedError(error)) return;
    toast({
      description: apiErrorMessage(error, t("billing.entitlementDenied.fallback")),
      variant: "destructive",
      duration: 0,
      action: {
        label: t("billing.actions.viewPlans"),
        onClick: () => router.push("/app/settings/billing"),
      },
    });
  };
}
