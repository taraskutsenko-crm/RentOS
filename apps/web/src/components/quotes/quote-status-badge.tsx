import { useTranslation } from "react-i18next";

import { cn, Tooltip } from "@rentos/ui";

import type { QuoteStatus } from "../../types/quote";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-light text-info",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-light text-success",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning-light text-warning",
};

const STATUS_TONE: Record<QuoteStatus, keyof typeof TONE_CLASSES> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "primary",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "warning",
  CONVERTED: "success",
  CANCELLED: "neutral",
};

/**
 * The single source of quote status color, reused by the Quote Workspace
 * and the quotes list page so status renders identically everywhere it
 * appears (docs/PRODUCT_BIBLE.md §10). Tones reuse the same semantic
 * tokens RentalStatusBadge already established — no new color is
 * introduced.
 */
export function QuoteStatusBadge({
  status,
  className,
}: {
  status: QuoteStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    // Task A8 — a lightweight tooltip explaining what each status means,
    // never the whole redesign; the text label (not just color) already
    // carries the status, so this only adds an explanation on top.
    <Tooltip content={t(`quote.statusTooltips.${status}`)}>
      <span
        tabIndex={0}
        className={cn(
          "rounded px-2 py-0.5 text-xs font-medium",
          TONE_CLASSES[STATUS_TONE[status]],
          className,
        )}
      >
        {t(`quote.statuses.${status}`)}
      </span>
    </Tooltip>
  );
}
