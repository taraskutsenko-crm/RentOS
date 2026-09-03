import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { FeatureEntitlementGuard } from "../../billing/feature-entitlement.guard";
import { RequireFeature } from "../../billing/require-feature.decorator";
import { PermissionsGuard } from "../../permissions/permissions.guard";
import { RequirePermissions } from "../../permissions/require-permissions.decorator";
import { TenantGuard } from "../../tenants/tenant.guard";
import type { PublicUser } from "../../users/user.mapper";
import { RequestDocumentSignatureDto } from "../dto/request-document-signature.dto";
import { DocumentSignatureService } from "./document-signature.service";

/**
 * Havelio Billing (Stage 17 closure pass) — requesting a NEW electronic
 * signature requires the ELECTRONIC_SIGNATURES feature (Business+);
 * viewing/polling/cancelling an already-requested signature never does —
 * see docs/DECISIONS.md "existing records must remain safe". Distinct from
 * CompanySignatureController (the tenant's own saved stamp image, used to
 * render documents — core functionality, never feature-gated).
 */
@UseGuards(TenantGuard, PermissionsGuard, FeatureEntitlementGuard)
@Controller("tenants/:tenantId/documents/:id/signature-requests")
export class DocumentSignatureController {
  constructor(private readonly signatureService: DocumentSignatureService) {}

  @RequirePermissions("documents.sign")
  @RequireFeature("ELECTRONIC_SIGNATURES")
  @Post()
  request(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() dto: RequestDocumentSignatureDto,
  ) {
    return this.signatureService.request(tenant.id, id, user.id, dto);
  }

  @RequirePermissions("documents.sign")
  @Get()
  findMany(@CurrentTenant() { tenant }: CurrentTenantContext, @Param("id") id: string) {
    return this.signatureService.findMany(tenant.id, id);
  }

  @RequirePermissions("documents.sign")
  @Post(":signatureRequestId/refresh")
  refreshStatus(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("signatureRequestId") signatureRequestId: string,
  ) {
    return this.signatureService.refreshStatus(tenant.id, id, signatureRequestId, user.id);
  }

  @RequirePermissions("documents.sign")
  @Post(":signatureRequestId/cancel")
  cancel(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Param("signatureRequestId") signatureRequestId: string,
  ) {
    return this.signatureService.cancel(tenant.id, id, signatureRequestId, user.id);
  }
}
