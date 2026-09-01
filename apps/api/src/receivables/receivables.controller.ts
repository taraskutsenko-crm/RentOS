import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import { FinancialSummaryQueryDto } from "./dto/financial-summary-query.dto";
import { ReceivablesService } from "./receivables.service";

/**
 * Read-only foundation endpoints for a future Financial Reports module —
 * see ReceivablesService's own doc comment. Gated on `payments.view`
 * (already read-only for VIEWER) since both endpoints only ever expose
 * aggregate invoice/payment totals a VIEWER can already see per-invoice.
 */
@UseGuards(TenantGuard, PermissionsGuard)
@RequirePermissions("payments.view")
@Controller("tenants/:tenantId/receivables")
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get("aging")
  aging(@CurrentTenant() { tenant }: CurrentTenantContext) {
    return this.receivablesService.getAgingBuckets(tenant.id);
  }

  @Get("summary")
  summary(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: FinancialSummaryQueryDto,
  ) {
    return this.receivablesService.getFinancialSummary(tenant.id, {
      from: new Date(query.from),
      to: new Date(query.to),
    });
  }
}
