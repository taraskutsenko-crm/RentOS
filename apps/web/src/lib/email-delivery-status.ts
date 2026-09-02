import type { TFunction } from "i18next";

import type { EmailErrorCategory } from "../types/email-delivery";

export interface EmailDeliveryStatusLike {
  status: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  errorMessage: string | null;
  errorCategory?: EmailErrorCategory | null;
}

/**
 * Task: Havelio email-delivery diagnosis — the shared `document.email.*` i18n
 * namespace already localizes the *status* badge (Pending/Sent/Failed/…) in
 * every language, but every "Send Email" list (Document/Quote/Invoice/
 * Payment demand) used to append the raw, always-English `errorMessage`
 * straight after it — a raw-backend-text leak into a localized UI (see
 * DECISIONS.md). This is the one place that turns a FAILED delivery's
 * *reason* into a real, translated sentence: prefer the coded
 * `errorCategory` (present on every delivery created after this fix) via
 * `document.email.errorCategories.<CATEGORY>`, and fall back to a generic
 * localized "delivery failed" line for older rows that predate the
 * category column — never the raw `errorMessage` string.
 */
export function emailDeliveryDetailText(t: TFunction, delivery: EmailDeliveryStatusLike): string {
  if (delivery.status !== "FAILED") return "";
  if (delivery.errorCategory) {
    return t(`document.email.errorCategories.${delivery.errorCategory}`);
  }
  return t("document.email.errorCategories.UNKNOWN");
}
