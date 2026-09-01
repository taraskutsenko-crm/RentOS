import { IsDateString, IsIn, IsOptional, IsString, Length } from "class-validator";

import { REPORT_PERIOD_PRESETS, type ReportPeriodPreset } from "../period.util";

/**
 * The base query shape shared by every Financial Reports endpoint. `from`/
 * `to` are only meaningful (and required) when `period=CUSTOM` — enforced
 * by `resolveReportPeriod` itself (see period.util.ts), not duplicated
 * here, so there is exactly one place the "CUSTOM requires both" rule
 * lives. `currency` is optional: omitted, a report groups by every
 * currency the tenant has data in (see docs/DECISIONS.md — never a
 * cross-currency grand total); provided, every aggregate is scoped to
 * that one currency only.
 */
export class FinanceReportQueryDto {
  @IsIn(REPORT_PERIOD_PRESETS)
  period!: ReportPeriodPreset;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
