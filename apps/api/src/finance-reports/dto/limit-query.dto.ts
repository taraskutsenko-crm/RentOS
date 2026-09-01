import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

import { FinanceReportQueryDto } from "./finance-report-query.dto";

/** Shared by the top-assets/top-categories endpoints — period/currency + a result-count cap. */
export class LimitQueryDto extends FinanceReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
