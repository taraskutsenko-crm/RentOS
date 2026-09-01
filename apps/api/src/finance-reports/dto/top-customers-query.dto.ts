import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

import { FinanceReportQueryDto } from "./finance-report-query.dto";

export const TOP_CUSTOMERS_METRICS = ["invoiced", "cashReceived", "outstanding"] as const;
export type TopCustomersMetric = (typeof TOP_CUSTOMERS_METRICS)[number];

export class TopCustomersQueryDto extends FinanceReportQueryDto {
  /**
   * "invoiced"/"cashReceived" are period-scoped (flow metrics); "outstanding"
   * is always a current snapshot regardless of the selected period — see
   * docs/DECISIONS.md snapshot-vs-flow distinction. Defaults to "invoiced"
   * so a plain top-customers call never silently mixes semantics.
   */
  @IsOptional()
  @IsIn(TOP_CUSTOMERS_METRICS)
  metric?: TopCustomersMetric = "invoiced";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
