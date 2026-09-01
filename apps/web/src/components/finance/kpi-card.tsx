"use client";

import { Card, CardContent } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { formatMoney } from "../../lib/money";
import type { CurrencyComparisonValue } from "../../types/finance-reports";

export interface KpiCardProps {
  label: string;
  valueMinor: number;
  currency: string;
  comparison?: CurrencyComparisonValue | undefined;
  /** Renders as plain text instead of a currency amount (e.g. collection rate). */
  displayOverride?: string | undefined;
  tone?: "neutral" | "positive" | "negative" | undefined;
}

/**
 * One KPI card — a real number is ALWAYS shown alongside any color, never
 * color-only (docs/PRODUCT_BIBLE.md Financial Reports §8/§26). The
 * previous-period comparison badge shows "New" rather than a misleading
 * Infinity% when the previous value was zero or there is no previous
 * period at all (§6).
 */
export function KpiCard({ label, valueMinor, currency, comparison, displayOverride, tone = "neutral" }: KpiCardProps) {
  const { t, i18n } = useTranslation();
  const toneClass =
    tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : "text-foreground";

  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        <p className={`text-2xl font-semibold ${toneClass}`}>
          {displayOverride ?? formatMoney(valueMinor, currency, i18n.language)}
        </p>
        {comparison && (
          <p className="text-xs">
            {!comparison.hasPrevious || comparison.percentChange === null ? (
              <span className="text-muted-foreground">{t("finance.comparison.new")}</span>
            ) : (
              <span className={comparison.percentChange >= 0 ? "text-success" : "text-destructive"}>
                {comparison.percentChange >= 0 ? "+" : ""}
                {comparison.percentChange}% {t("finance.comparison.vsPreviousPeriod")}
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
