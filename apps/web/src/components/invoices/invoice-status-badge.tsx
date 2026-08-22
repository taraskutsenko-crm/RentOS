import { useTranslation } from "react-i18next";

import { cn } from "@rentos/ui";

import type { InvoiceStatus } from "../../types/invoice";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-light text-info",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success-light text-success",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning-light text-warning",
};

const STATUS_TONE: Record<InvoiceStatus, keyof typeof TONE_CLASSES> = {
  DRAFT: "neutral",
  ISSUED: "info",
  SENT: "primary",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "neutral",
  CORRECTED: "neutral",
};

/** The single source of Invoice status color, mirroring DocumentStatusBadge's convention exactly. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
      )}
    >
      {t(`invoice.statuses.${status}`)}
    </span>
  );
}
