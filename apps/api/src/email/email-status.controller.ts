import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentTenant, type CurrentTenantContext } from "../auth/decorators/current-tenant.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import { EmailService } from "./email.service";

export type EmailStatus = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTION_TEST_FAILED" | "READY";

export interface EmailStatusView {
  status: EmailStatus;
  error?: string;
}

/**
 * Honest email-provider status for Settings/Integrations — NOT_CONFIGURED
 * (no real provider bound, e.g. LoggingEmailProvider), CONFIGURED (a real
 * provider is bound but it can't verify its own connectivity), READY (bound
 * AND a real connectivity check succeeded), CONNECTION_TEST_FAILED (bound
 * but the connectivity check failed). Never claims READY without an actual
 * check — see EmailProvider.testConnection / DECISIONS.md.
 *
 * Deliberately tenant-routed (matches the e-invoice integrations pattern
 * and its permission gate) even though today's email configuration is
 * environment-level, not per-tenant — see DECISIONS.md production-
 * infrastructure pass for why tenant-managed SMTP credentials are out of
 * scope for this pass (no secure per-tenant secret storage exists yet).
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/integrations/email")
export class EmailStatusController {
  constructor(private readonly emailService: EmailService) {}

  @RequirePermissions("integrations.view")
  @Get("status")
  async getStatus(@CurrentTenant() _context: CurrentTenantContext): Promise<EmailStatusView> {
    if (!this.emailService.isConfigured()) {
      return { status: "NOT_CONFIGURED" };
    }
    const testResult = await this.emailService.testConnection();
    if (!testResult) {
      return { status: "CONFIGURED" };
    }
    return testResult.ok
      ? { status: "READY" }
      : { status: "CONNECTION_TEST_FAILED", ...(testResult.error ? { error: testResult.error } : {}) };
  }
}
