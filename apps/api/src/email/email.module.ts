import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { EmailStatusController } from "./email-status.controller";
import { EmailTestService } from "./email-test.service";
import { EmailService } from "./email.service";
import { EMAIL_PROVIDER } from "./email.types";
import { LoggingEmailProvider } from "./logging-email.provider";
import { SmtpEmailProvider } from "./smtp-email.provider";

/**
 * EMAIL_DRIVER selects the bound EmailProvider implementation — "logging"
 * (default, dev/test) or "smtp" (any transactional-SMTP provider). Mirrors
 * StorageModule's STORAGE_DRIVER factory-provider shape exactly. See
 * docs/adr/0013-production-storage-and-email.md.
 */
@Module({
  imports: [ConfigModule, TenantsModule, PermissionsModule, StorageModule, AuditModule],
  controllers: [EmailStatusController],
  providers: [
    EmailService,
    EmailTestService,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (configService: ConfigService<ApiEnv, true>) => {
        const driver = configService.get("EMAIL_DRIVER", { infer: true });
        return driver === "smtp"
          ? new SmtpEmailProvider(configService)
          : new LoggingEmailProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
