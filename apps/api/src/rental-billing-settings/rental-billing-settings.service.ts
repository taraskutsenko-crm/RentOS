import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertCustomMonthLengthDays } from "../rentals/rental-pricing.util";
import type { UpdateRentalBillingSettingsDto } from "./dto/update-rental-billing-settings.dto";
import type {
  EffectiveRentalBillingSettings,
  RentalBillingSettingsView,
} from "./rental-billing-settings.types";

const DEFAULT_SETTINGS: EffectiveRentalBillingSettings = {
  monthlyBillingStrategy: "CALENDAR_MONTH",
  customMonthLengthDays: null,
};

@Injectable()
export class RentalBillingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * The values pricing code should actually use. Every tenant without a
   * stored row — including every tenant that existed before this feature
   * shipped — gets CALENDAR_MONTH/null, with no data migration required
   * (see docs/adr/0008-configurable-monthly-billing-strategies.md).
   */
  async getEffective(tenantId: string): Promise<EffectiveRentalBillingSettings> {
    const settings = await this.prisma.rentalBillingSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      return DEFAULT_SETTINGS;
    }
    return {
      monthlyBillingStrategy: settings.monthlyBillingStrategy,
      customMonthLengthDays: settings.customMonthLengthDays,
    };
  }

  /** Same values as getEffective, shaped for the settings API response. */
  async getView(tenantId: string): Promise<RentalBillingSettingsView> {
    const settings = await this.prisma.rentalBillingSettings.findUnique({ where: { tenantId } });
    if (!settings) {
      return { tenantId, ...DEFAULT_SETTINGS, isDefault: true, updatedAt: null };
    }
    return {
      tenantId,
      monthlyBillingStrategy: settings.monthlyBillingStrategy,
      customMonthLengthDays: settings.customMonthLengthDays,
      isDefault: false,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async update(
    tenantId: string,
    actorUserId: string,
    dto: UpdateRentalBillingSettingsDto,
  ): Promise<RentalBillingSettingsView> {
    const previous = await this.getEffective(tenantId);
    const customMonthLengthDays =
      dto.monthlyBillingStrategy === "CUSTOM"
        ? assertCustomMonthLengthDays(dto.customMonthLengthDays)
        : null;

    const settings = await this.prisma.rentalBillingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        monthlyBillingStrategy: dto.monthlyBillingStrategy,
        customMonthLengthDays,
      },
      update: {
        monthlyBillingStrategy: dto.monthlyBillingStrategy,
        customMonthLengthDays,
      },
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "rental_billing_settings.updated",
      entityType: "RentalBillingSettings",
      entityId: settings.id,
      metadata: {
        from: { ...previous },
        to: {
          monthlyBillingStrategy: settings.monthlyBillingStrategy,
          customMonthLengthDays: settings.customMonthLengthDays,
        },
      },
    });

    return {
      tenantId,
      monthlyBillingStrategy: settings.monthlyBillingStrategy,
      customMonthLengthDays: settings.customMonthLengthDays,
      isDefault: false,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
