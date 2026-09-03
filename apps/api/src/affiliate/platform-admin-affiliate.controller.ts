import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PlatformAdminGuard } from "../billing/platform-admin.guard";
import type { PublicUser } from "../users/user.mapper";
import { AffiliateAnalyticsService } from "./affiliate-analytics.service";
import { AffiliateAttributionService } from "./affiliate-attribution.service";
import { AffiliateCommissionService } from "./affiliate-commission.service";
import { AffiliatePartnersService } from "./affiliate-partners.service";
import { AffiliatePayoutsService } from "./affiliate-payouts.service";
import { AdminOverrideAttributionDto } from "./dto/admin-override-attribution.dto";
import { CreateAffiliateCampaignDto } from "./dto/create-affiliate-campaign.dto";
import { CreateAffiliatePartnerDto } from "./dto/create-affiliate-partner.dto";
import { CreatePromoCodeDto } from "./dto/create-promo-code.dto";
import { ManualAdjustmentDto } from "./dto/manual-adjustment.dto";
import { RecordPayoutDto } from "./dto/record-payout.dto";
import { UpdatePartnerStatusDto } from "./dto/update-partner-status.dto";

/**
 * Havelio PLATFORM administration -> Affiliates (Stage 17). Every route is
 * gated by PlatformAdminGuard — never reachable by an ordinary tenant OWNER/
 * ADMIN, no matter how many permissions their tenant membership has (see
 * PlatformAdminGuard's own doc comment and platform-admin.guard.spec.ts).
 */
@UseGuards(PlatformAdminGuard)
@Controller("platform-admin/affiliate")
export class PlatformAdminAffiliateController {
  constructor(
    private readonly partnersService: AffiliatePartnersService,
    private readonly attributionService: AffiliateAttributionService,
    private readonly commissionService: AffiliateCommissionService,
    private readonly payoutsService: AffiliatePayoutsService,
    private readonly analyticsService: AffiliateAnalyticsService,
  ) {}

  @Get("partners")
  listPartners() {
    return this.partnersService.listPartners();
  }

  @Get("partners/:id")
  async getPartner(@Param("id", ParseUUIDPipe) id: string) {
    const [partner, campaigns, analytics, balances] = await Promise.all([
      this.partnersService.getPartner(id),
      this.partnersService.listCampaigns(id),
      this.analyticsService.getPartnerAnalytics(id),
      this.commissionService.getPartnerBalances(id),
    ]);
    return { partner, campaigns, analytics, balances };
  }

  @Post("partners")
  createPartner(@Body() dto: CreateAffiliatePartnerDto, @CurrentUser() user: PublicUser) {
    return this.partnersService.createPartner(dto, user.id);
  }

  @Patch("partners/:id/status")
  updatePartnerStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerStatusDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.partnersService.updatePartnerStatus(id, dto.status, user.id);
  }

  @Post("partners/:id/campaigns")
  createCampaign(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateAffiliateCampaignDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.partnersService.createCampaign(id, dto, user.id);
  }

  @Post("promo-codes")
  createPromoCode(@Body() dto: CreatePromoCodeDto, @CurrentUser() user: PublicUser) {
    return this.partnersService.createPromoCode(dto, user.id);
  }

  @Get("promo-codes")
  listPromoCodes(@Query("campaignId") campaignId?: string) {
    return this.partnersService.listPromoCodes(campaignId);
  }

  @Get("attributions/:tenantId")
  getAttribution(@Param("tenantId", ParseUUIDPipe) tenantId: string) {
    return this.attributionService.getForTenant(tenantId);
  }

  @Post("attributions/:tenantId/override")
  overrideAttribution(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminOverrideAttributionDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.attributionService.recordAdminOverride(tenantId, dto.partnerId, dto.campaignId ?? null, user.id);
  }

  @Post("partners/:id/payouts")
  recordPayout(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordPayoutDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.payoutsService.recordPayout(
      id,
      dto.amountMinor,
      dto.currency,
      new Date(dto.payoutDate),
      dto.method,
      user.id,
      dto.reference,
      dto.note,
    );
  }

  @Get("partners/:id/payouts")
  listPayouts(@Param("id", ParseUUIDPipe) id: string) {
    return this.payoutsService.listForPartner(id);
  }

  @Get("partners/:id/payable")
  getPayable(@Param("id", ParseUUIDPipe) id: string, @Query("currency") currency: string) {
    return this.payoutsService.getPayableSummary(id, currency ?? "EUR");
  }

  /**
   * Manual, auditable correction to a partner's balance (e.g. a one-off
   * goodwill credit, or fixing a bookkeeping mistake) — never edits/deletes
   * an existing ledger row, always appends a new MANUAL_ADJUSTMENT entry.
   * See docs/DECISIONS.md "refunds/reversals/chargebacks."
   */
  @Post("partners/:id/adjustments")
  recordAdjustment(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ManualAdjustmentDto) {
    return this.commissionService.recordManualAdjustment(id, dto.amountMinor, dto.currency, dto.note, dto.tenantId);
  }
}
