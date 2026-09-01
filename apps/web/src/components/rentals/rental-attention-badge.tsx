import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

import { formatTime } from "../../lib/date-format";
import type { RentalAttentionCategory } from "../../types/rental";

const TONE_CLASSES: Record<RentalAttentionCategory, string> = {
  OVERDUE_RETURN: "bg-danger-light text-destructive border border-destructive/30",
  ENDING_TODAY: "bg-warning-light text-warning border border-warning/30",
  ENDING_TOMORROW: "bg-info-light text-info border border-info/30",
};

/**
 * The Rental Attention System's compact inline badge — shown next to
 * (never replacing) the lifecycle `RentalStatusBadge` on the Rentals list
 * (docs/PRODUCT_BIBLE.md Rental Attention System §A5). Always a real
 * count/time alongside the color — see `rental-attention-card.tsx`'s own
 * doc comment for the same "never color alone" rule.
 */
export function RentalAttentionBadge({
  attention,
  plannedEnd,
  overdueSince,
  locale,
  timeZone,
  className,
}: {
  attention: RentalAttentionCategory;
  plannedEnd: string;
  overdueSince: string | null;
  locale: string;
  timeZone: string | undefined;
  className?: string;
}) {
  const { t } = useTranslation();
  // Date.now() cannot be called during render (impure) — a lazy useState
  // initializer is the sanctioned one-time-impure-computation escape hatch
  // (mirrors the same pattern in rentals/[id]/page.tsx).
  const [nowMs] = useState<number>(() => Date.now());

  const label = (() => {
    if (attention === "OVERDUE_RETURN") {
      // Elapsed real time since a known UTC instant — timezone-agnostic,
      // never a calendar-day comparison, so this is safe to compute
      // client-side (unlike the OVERDUE_RETURN/ENDING_TODAY/
      // ENDING_TOMORROW classification itself, which is always the
      // server's own tenant-timezone-derived answer, never recomputed
      // here).
      const since = overdueSince ? new Date(overdueSince).getTime() : new Date(plannedEnd).getTime();
      const days = Math.max(0, Math.floor((nowMs - since) / 86_400_000));
      return t("rental.attention.overdueReturnDays", { count: days });
    }
    const time = formatTime(plannedEnd, locale, timeZone);
    return attention === "ENDING_TODAY"
      ? t("rental.attention.endsTodayAt", { time })
      : t("rental.attention.endsTomorrowAt", { time });
  })();

  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", TONE_CLASSES[attention], className)}>
      {label}
    </span>
  );
}
