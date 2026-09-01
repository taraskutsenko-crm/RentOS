"use client";

import { useTranslation } from "react-i18next";

import { formatMoney } from "../../lib/money";
import type { AgingBucket, AgingCurrencyRow } from "../../types/finance-reports";

const BUCKET_ORDER: AgingBucket[] = ["NOT_DUE", "1_7_DAYS", "8_30_DAYS", "31_60_DAYS", "61_90_DAYS", "90_PLUS_DAYS"];

export function AgingBarChart({ row }: { row: AgingCurrencyRow }) {
  const { t, i18n } = useTranslation();
  const maxValue = Math.max(1, ...row.buckets.map((b) => b.outstandingMinor));

  return (
    <div className="flex flex-col gap-2">
      {BUCKET_ORDER.map((bucket) => {
        const entry = row.buckets.find((b) => b.bucket === bucket);
        const amountMinor = entry?.outstandingMinor ?? 0;
        const widthPct = Math.round((amountMinor / maxValue) * 100);
        return (
          <div key={bucket} className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground w-20 shrink-0 text-xs">{t(`finance.aging.${bucket}`)}</span>
            <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className={bucket === "NOT_DUE" ? "bg-success h-full" : "bg-destructive h-full"}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums">
              {formatMoney(amountMinor, row.currency, i18n.language)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
