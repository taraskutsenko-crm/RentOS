import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

import type { RentalStatus } from "../../types/rental";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-light text-info",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-light text-success",
};

const STATUS_TONE: Record<RentalStatus, keyof typeof TONE_CLASSES> = {
  DRAFT: "neutral",
  QUOTE: "neutral",
  RESERVED: "info",
  ACTIVE: "primary",
  RETURNED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

/**
 * The single source of rental status color, reused by the Rental Workspace
 * and the rentals list page so status renders identically everywhere it
 * appears (docs/PRODUCT_BIBLE.md §10). Tones reuse the same semantic tokens
 * Alert's variants already use — no new color is introduced.
 */
export function RentalStatusBadge({
  status,
  className,
}: {
  status: RentalStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[STATUS_TONE[status]],
        className,
      )}
    >
      {t(`rental.statuses.${status}`)}
    </span>
  );
}
