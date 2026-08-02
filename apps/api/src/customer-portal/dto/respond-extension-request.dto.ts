import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class RespondExtensionRequestDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  responseMessage?: string;
}
