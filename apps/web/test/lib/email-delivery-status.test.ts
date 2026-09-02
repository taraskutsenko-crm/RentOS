import { describe, expect, it } from "vitest";

import { emailDeliveryDetailText } from "../../src/lib/email-delivery-status";
import i18n from "../../src/lib/i18n";

const t = i18n.getFixedT("en");

// Email-delivery diagnosis task — the one place that turns a FAILED
// delivery's reason into a translated sentence instead of the raw,
// always-English backend `errorMessage` (see DECISIONS.md, raw-text-leak
// fix). PENDING/SENT/NOT_CONFIGURED never show a detail line here — their
// own status badge already says everything truthfully.
describe("emailDeliveryDetailText", () => {
  it("returns the localized category text for a FAILED delivery with a category", () => {
    const text = emailDeliveryDetailText(t, {
      status: "FAILED",
      errorMessage: "The email provider rejected or failed to send this message",
      errorCategory: "AUTH_FAILED",
    });
    expect(text).toBe("The email account's credentials were rejected.");
  });

  it("never returns the raw errorMessage even when a category is present", () => {
    const text = emailDeliveryDetailText(t, {
      status: "FAILED",
      errorMessage: "535 Authentication failed for user apikey@smtp.example.com",
      errorCategory: "AUTH_FAILED",
    });
    expect(text).not.toContain("apikey");
    expect(text).not.toContain("535");
  });

  it("falls back to a generic localized message for a legacy FAILED row with no category", () => {
    const text = emailDeliveryDetailText(t, {
      status: "FAILED",
      errorMessage: "some old raw error",
      errorCategory: null,
    });
    expect(text).toBe("Delivery failed.");
    expect(text).not.toContain("some old raw error");
  });

  it.each(["PENDING", "SENT", "NOT_CONFIGURED"] as const)(
    "returns an empty string for %s (the status badge already says everything truthfully)",
    (status) => {
      expect(
        emailDeliveryDetailText(t, { status, errorMessage: null, errorCategory: null }),
      ).toBe("");
    },
  );
});
