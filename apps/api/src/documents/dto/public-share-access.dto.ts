import { IsOptional, IsString, MaxLength } from "class-validator";

/** Body for a public share-link request that might be password-protected. */
export class PublicShareAccessDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}
