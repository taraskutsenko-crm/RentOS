import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

import type { DocumentStatus } from "../../types/document";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-light text-info",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-light text-success",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning-light text-warning",
};

const STATUS_TONE: Record<DocumentStatus, keyof typeof TONE_CLASSES> = {
  DRAFT: "neutral",
  READY: "info",
  SENT: "info",
  VIEWED: "primary",
  PARTIALLY_SIGNED: "warning",
  SIGNED: "success",
  REJECTED: "destructive",
  VOIDED: "neutral",
  ARCHIVED: "neutral",
};

/**
 * The single source of document status color, reused by the Documents
 * Workspace and the documents list page so status renders identically
 * everywhere it appears (docs/PRODUCT_BIBLE.md §10). Tones reuse the same
 * semantic tokens RentalStatusBadge/QuoteStatusBadge already established —
 * no new color is introduced.
 */
export function DocumentStatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
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
      {t(`document.statuses.${status}`)}
    </span>
  );
}
