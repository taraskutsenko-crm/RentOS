import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { SendDocumentEmailDto } from "../dto/send-document-email.dto";
import { DocumentEmailService } from "./document-email.service";

@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/documents/:id/email")
export class DocumentEmailController {
  constructor(private readonly emailService: DocumentEmailService) {}

  @RequirePermissions("documents.send")
  @Post()
  send(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: SendDocumentEmailDto,
  ) {
    return this.emailService.send(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.send")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.emailService.findMany(tenant.id, id);
  }

  @RequirePermissions("documents.send")
  @Post(":emailDeliveryId/retry")
  retry(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("emailDeliveryId") emailDeliveryId: string,
  ) {
    return this.emailService.retry(tenant.id, id, emailDeliveryId, user.id);
  }
}
