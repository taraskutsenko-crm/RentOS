import { Controller, Get, UseGuards } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { PlatformAdminGuard } from "./platform-admin.guard";

/**
 * Havelio PLATFORM administration (Stage 17) — cross-tenant visibility into
 * every HavelioSubscription, for Havelio staff only (see
 * PlatformAdminGuard's own doc comment). No ordinary tenant OWNER/ADMIN can
 * reach this — see platform-admin.guard.spec.ts / billing.e2e-spec.ts's
 * K10-equivalent test.
 */
@UseGuards(PlatformAdminGuard)
@Controller("platform-admin/billing")
export class PlatformAdminBillingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("subscriptions")
  async listSubscriptions() {
    const subscriptions = await this.prisma.havelioSubscription.findMany({
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { subscriptions };
  }
}
