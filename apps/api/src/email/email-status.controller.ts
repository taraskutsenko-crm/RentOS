import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import {
  CurrentTenant,
  type CurrentTenantContext,
} from "../auth/decorators/current-tenant.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { PublicUser } from "../users/user.mapper";
import { SendTestEmailDto } from "./dto/send-test-email.dto";
import { EmailTestService } from "./email-test.service";
import { EmailService } from "./email.service";
import type { EmailSendResult } from "./email.types";

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
  constructor(
    private readonly emailService: EmailService,
    private readonly emailTestService: EmailTestService,
  ) {}

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
      : {
          status: "CONNECTION_TEST_FAILED",
          ...(testResult.error ? { error: testResult.error } : {}),
        };
  }

  /**
   * Task B4 — a real test send through the exact provider/pipeline every
   * other transactional email uses (see EmailTestService's own doc
   * comment). Gated behind `integrations.manage` (not the weaker
   * `.view`) and rate-limited — this is a real send action, not a
   * read-only status check, and must never become an arbitrary open mail
   * relay for a tenant's staff.
   */
  @RequirePermissions("integrations.manage")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("test")
  sendTest(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @CurrentUser() user: PublicUser,
    @Body() dto: SendTestEmailDto,
  ): Promise<EmailSendResult> {
    return this.emailTestService.sendTest(tenant.id, dto.recipientEmail, user.id);
  }
}
