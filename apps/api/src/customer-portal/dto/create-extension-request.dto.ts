import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateExtensionRequestDto {
  @IsDateString()
  requestedEnd!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
