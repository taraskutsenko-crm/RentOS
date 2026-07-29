import { Module } from "@nestjs/common";

import { EmailService } from "./email.service";
import { EMAIL_PROVIDER } from "./email.types";
import { LoggingEmailProvider } from "./logging-email.provider";

@Module({
  providers: [EmailService, { provide: EMAIL_PROVIDER, useClass: LoggingEmailProvider }],
  exports: [EmailService],
})
export class EmailModule {}
