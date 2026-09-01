import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

/**
 * Havelio Payments & Receivables — a visual payment-progress indicator.
 * Color is never the only cue (see the invoice detail page, which always
 * pairs this with real numbers: "750 / 1,000 PLN", "75% paid", "250 PLN
 * remaining") — this component itself exposes the percentage via
 * `role="progressbar"`/`aria-valuenow` and a text `aria-label` for
 * accessibility.
 *
 * Rules (docs/PRODUCT_BIBLE.md):
 *  - fully paid: solid green
 *  - 0% paid, not yet due: neutral gray (no alarm)
 *  - 0% paid, overdue: solid red
 *  - partial payment (any amount, due or not): a two-segment bar — green
 *    for the paid proportion, red for the unpaid proportion — exactly as
 *    specified (e.g. 75% paid renders ~75% green / ~25% red).
 */
export function PaymentProgressBar({
  percentagePaid,
  isOverdue,
}: {
  percentagePaid: number;
  isOverdue: boolean;
}) {
  const { t } = useTranslation();
  const paidPct = Math.max(0, Math.min(100, percentagePaid));
  const isFullyPaid = paidPct >= 100;
  const isZeroPaid = paidPct <= 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(paidPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t("payment.progressBar.label", { percent: Math.round(paidPct) })}
      className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
    >
      {isFullyPaid ? (
        <div className="bg-success h-full w-full" />
      ) : isZeroPaid ? (
        <div className={cn("h-full w-full", isOverdue ? "bg-destructive" : "bg-muted")} />
      ) : (
        <>
          <div className="bg-success h-full" style={{ width: `${paidPct}%` }} />
          <div className="bg-destructive/70 h-full" style={{ width: `${100 - paidPct}%` }} />
        </>
      )}
    </div>
  );
}
