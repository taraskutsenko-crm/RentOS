import { IsDateString } from "class-validator";

export class FinancialSummaryQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
