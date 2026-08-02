import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { PortalDamageReportsService } from "../damage-reports/portal-damage-reports.service";
import { ReviewDamageReportDto } from "../dto/review-damage-report.dto";
import { RespondExtensionRequestDto } from "../dto/respond-extension-request.dto";
import { SendPortalMessageDto } from "../dto/send-portal-message.dto";
import { PortalExtensionRequestsService } from "../extension-requests/portal-extension-requests.service";
import { PortalMessagesService } from "../messages/portal-messages.service";

/**
 * Staff-side administration of everything a customer can do in the portal
 * (extension requests, damage reports; messages joins this same controller
 * as that module is built — see docs/adr/0012-customer-portal.md). Kept as
 * one controller rather than one per concern, mirroring
 * CustomerPortalInvitationsController's own single-concern-per-file size —
 * this one just has more than one related action.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@RequirePermissions("customers.portal.manage")
@Controller("tenants/:tenantId")
export class StaffPortalController {
  constructor(
    private readonly extensionRequestsService: PortalExtensionRequestsService,
    private readonly damageReportsService: PortalDamageReportsService,
    private readonly messagesService: PortalMessagesService,
  ) {}

  @Get("extension-requests")
  findExtensionRequests(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query("rentalId") rentalId?: string,
  ) {
    return this.extensionRequestsService.findManyForStaff(tenant.id, rentalId);
  }

  @Post("extension-requests/:id/respond")
  respondToExtensionRequest(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: RespondExtensionRequestDto,
  ) {
    return this.extensionRequestsService.respond(tenant.id, id, user.id, dto);
  }

  @Get("damage-reports")
  findDamageReports(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query("rentalId") rentalId?: string,
  ) {
    return this.damageReportsService.findManyForStaff(tenant.id, rentalId);
  }

  @Post("damage-reports/:id/review")
  reviewDamageReport(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: ReviewDamageReportDto,
  ) {
    return this.damageReportsService.review(tenant.id, id, user.id, dto);
  }

  @Post("damage-reports/:id/convert")
  convertDamageReport(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
  ) {
    return this.damageReportsService.convertToDocument(tenant.id, id, user.id);
  }

  @Get("damage-reports/:id/photos/:photoId")
  async getDamageReportPhoto(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, fileName } = await this.damageReportsService.readPhotoForStaff(
      tenant.id,
      id,
      photoId,
    );
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.type(mimeType).send(buffer);
  }

  @Get("customers/:customerId/portal/messages")
  findMessages(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Param("customerId") customerId: string,
    @Query("rentalId") rentalId?: string,
  ) {
    return this.messagesService.findManyForStaff(tenant.id, customerId, rentalId);
  }

  @Post("customers/:customerId/portal/messages")
  sendMessage(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("customerId") customerId: string,
    @Body() dto: SendPortalMessageDto,
  ) {
    return this.messagesService.sendAsStaff(tenant.id, user.id, customerId, dto);
  }
}
