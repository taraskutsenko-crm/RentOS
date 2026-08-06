"use client";

import { cn } from "@rentos/ui";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDismissibleHint } from "../../hooks/use-dismissible-hint";

/**
 * One reusable, non-modal callout — dismissed once, remembered forever,
 * never blocking anything underneath it. See
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 7 and
 * docs/PRODUCT_BIBLE.md §8/§11 ("teach through usage, never a blocking
 * tutorial"). Any future hint reuses this component with a new `hintId`.
 */
export function DismissibleHint({
  hintId,
  message,
  className,
}: {
  hintId: string;
  message: string;
  className?: string | undefined;
}) {
  const { t } = useTranslation();
  const { dismissed, dismiss } = useDismissibleHint(hintId);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "bg-primary-light text-primary flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
        className,
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.dismiss")}
        className="text-primary/70 hover:text-primary shrink-0 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
