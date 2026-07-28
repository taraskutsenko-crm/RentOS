import { Logger, Module, type OnModuleInit } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { TenantsModule } from "../tenants/tenants.module";
import { AssetStatusesController } from "./asset-statuses.controller";
import { AssetStatusesService } from "./asset-statuses.service";

@Module({
  imports: [PrismaModule, AuditModule, TenantsModule, PermissionsModule],
  controllers: [AssetStatusesController],
  providers: [AssetStatusesService],
  exports: [AssetStatusesService],
})
export class AssetStatusesModule implements OnModuleInit {
  private readonly logger = new Logger(AssetStatusesModule.name);

  constructor(
    private readonly assetStatusesService: AssetStatusesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Backfills the eight system statuses for any tenant that predates the
   * Assets module (new tenants get them at registration time instead — see
   * AuthService.register). Idempotent: seedSystemStatuses skips duplicates,
   * so re-running this on every boot is safe and cheap at this scale.
   */
  async onModuleInit(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const tenant of tenants) {
      await this.assetStatusesService.seedSystemStatuses(tenant.id);
    }

    if (tenants.length > 0) {
      this.logger.log(`Verified system asset statuses for ${tenants.length} tenant(s)`);
    }
  }
}
