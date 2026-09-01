"use client";

import { useTranslation } from "react-i18next";

import { formatMoney } from "../../lib/money";
import type { CashSeriesPoint } from "../../types/finance-reports";

export interface CashSeriesChartProps {
  points: CashSeriesPoint[];
  currency: string;
  granularity: "day" | "month";
}

const CHART_HEIGHT = 160;
const BAR_GAP = 4;

/**
 * A restrained, hand-rolled SVG grouped-bar chart — one currency at a
 * time (docs/PRODUCT_BIBLE.md §9), invoiced vs cash received per bucket.
 * No animation, no external charting dependency: the codebase already
 * favors small hand-built SVG for this class of visual (see
 * payment-progress-bar.tsx).
 */
export function CashSeriesChart({ points, currency, granularity }: CashSeriesChartProps) {
  const { t, i18n } = useTranslation();

  if (points.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{t("finance.chart.noData")}</p>;
  }

  const maxValue = Math.max(1, ...points.flatMap((p) => [p.invoicedMinor, p.cashReceivedMinor]));
  const groupWidth = Math.max(28, Math.min(64, 640 / points.length));
  const width = points.length * groupWidth;

  function formatLabel(date: string): string {
    if (granularity === "month") {
      const [year, month] = date.split("-");
      return new Intl.DateTimeFormat(i18n.language, { month: "short", year: "2-digit" }).format(
        new Date(Date.UTC(Number(year), Number(month) - 1, 1)),
      );
    }
    const d = new Date(`${date}T00:00:00Z`);
    return new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary inline-block size-2.5 rounded-sm" aria-hidden="true" />
          {t("finance.chart.invoiced")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-success inline-block size-2.5 rounded-sm" aria-hidden="true" />
          {t("finance.chart.cashReceived")}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={t("finance.chart.title")}
          viewBox={`0 0 ${width} ${CHART_HEIGHT + 24}`}
          width={width}
          height={CHART_HEIGHT + 24}
          className="min-w-full"
        >
          {points.map((point, index) => {
            const x = index * groupWidth;
            const barWidth = (groupWidth - BAR_GAP * 3) / 2;
            const invoicedHeight = (point.invoicedMinor / maxValue) * CHART_HEIGHT;
            const cashHeight = (point.cashReceivedMinor / maxValue) * CHART_HEIGHT;
            return (
              <g key={point.date}>
                <title>
                  {formatLabel(point.date)}: {t("finance.chart.invoiced")} {formatMoney(point.invoicedMinor, currency, i18n.language)},{" "}
                  {t("finance.chart.cashReceived")} {formatMoney(point.cashReceivedMinor, currency, i18n.language)}
                </title>
                <rect
                  x={x + BAR_GAP}
                  y={CHART_HEIGHT - invoicedHeight}
                  width={barWidth}
                  height={invoicedHeight}
                  className="fill-primary"
                  rx={2}
                />
                <rect
                  x={x + BAR_GAP * 2 + barWidth}
                  y={CHART_HEIGHT - cashHeight}
                  width={barWidth}
                  height={cashHeight}
                  className="fill-success"
                  rx={2}
                />
                <text
                  x={x + groupWidth / 2}
                  y={CHART_HEIGHT + 16}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={9}
                >
                  {formatLabel(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
