import { IsEmail, MaxLength } from "class-validator";

export class SendTestEmailDto {
  @IsEmail()
  @MaxLength(320) // RFC 5321 4.5.3.1.3 max mailbox length — matches tenant-sender-identity.util.ts's own bound
  recipientEmail!: string;
}
