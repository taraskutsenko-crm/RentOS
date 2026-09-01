"use client";

import { DatePicker, Label, Select } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { REPORT_PERIOD_PRESETS } from "../../lib/finance-period-options";
import type { ReportPeriodPreset } from "../../types/finance-reports";

export interface PeriodSelectorProps {
  period: ReportPeriodPreset;
  from: string;
  to: string;
  onChange: (next: { period: ReportPeriodPreset; from: string; to: string }) => void;
}

/** The period/date-range picker every Financial Reports tab shares — all 12 presets from docs/PRODUCT_BIBLE.md §5, plus a custom range using the same DatePicker every other date field in this app uses. */
export function PeriodSelector({ period, from, to, onChange }: PeriodSelectorProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="finance-period">{t("finance.period.label")}</Label>
        <Select
          id="finance-period"
          value={period}
          onChange={(e) => onChange({ period: e.target.value as ReportPeriodPreset, from, to })}
        >
          {REPORT_PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {t(`finance.period.${preset}`)}
            </option>
          ))}
        </Select>
      </div>
      {period === "CUSTOM" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="finance-period-from">{t("finance.period.from")}</Label>
            <DatePicker
              id="finance-period-from"
              value={from}
              onChange={(value) => onChange({ period, from: value, to })}
              locale={i18n.language}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="finance-period-to">{t("finance.period.to")}</Label>
            <DatePicker
              id="finance-period-to"
              value={to}
              onChange={(value) => onChange({ period, from, to: value })}
              locale={i18n.language}
              min={from || undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}
