import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AffiliateCampaign,
  AffiliatePartner,
  AffiliateStatus,
  BillingInterval,
  HavelioPlan,
  PromoCode,
  PromoDiscountType,
  PromoDuration,
} from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/** Havelio Affiliate/Partner domain (Stage 17) — Partner/Campaign/PromoCode CRUD for Platform Admin. Never visible to ordinary tenants. */
@Injectable()
export class AffiliatePartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listPartners(): Promise<AffiliatePartner[]> {
    return this.prisma.affiliatePartner.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getPartner(id: string): Promise<AffiliatePartner> {
    const partner = await this.prisma.affiliatePartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException("Affiliate partner not found.");
    return partner;
  }

  async createPartner(
    input: { displayName: string; legalName?: string; email: string; contactInfo?: string; internalNotes?: string },
    actorUserId: string,
  ): Promise<AffiliatePartner> {
    const partner = await this.prisma.affiliatePartner.create({
      data: { ...input, createdByUserId: actorUserId },
    });
    await this.auditService.log({
      userId: actorUserId,
      action: "billing.affiliate_partner.created",
      entityType: "AffiliatePartner",
      entityId: partner.id,
      metadata: { displayName: partner.displayName },
    });
    return partner;
  }

  async updatePartnerStatus(id: string, status: AffiliateStatus, actorUserId: string): Promise<AffiliatePartner> {
    const partner = await this.prisma.affiliatePartner.update({ where: { id }, data: { status } });
    await this.auditService.log({
      userId: actorUserId,
      action: "billing.affiliate_partner.status_changed",
      entityType: "AffiliatePartner",
      entityId: partner.id,
      metadata: { status },
    });
    return partner;
  }

  listCampaigns(partnerId: string): Promise<AffiliateCampaign[]> {
    return this.prisma.affiliateCampaign.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" } });
  }

  async createCampaign(
    partnerId: string,
    input: { name: string; slug: string; commissionRateBp: number; commissionDurationMonths: number },
    actorUserId: string,
  ): Promise<AffiliateCampaign> {
    if (input.commissionRateBp < 0 || input.commissionRateBp > 10000) {
      throw new BadRequestException("commissionRateBp must be between 0 and 10000.");
    }
    const campaign = await this.prisma.affiliateCampaign.create({
      data: { partnerId, ...input },
    });
    await this.auditService.log({
      userId: actorUserId,
      action: "billing.affiliate_campaign.created",
      entityType: "AffiliateCampaign",
      entityId: campaign.id,
      metadata: { partnerId, slug: campaign.slug, commissionRateBp: campaign.commissionRateBp },
    });
    return campaign;
  }

  async createPromoCode(
    input: {
      code: string;
      discountType: PromoDiscountType;
      discountValueBp?: number;
      discountValueMinor?: number;
      currency?: string;
      duration: PromoDuration;
      durationInMonths?: number;
      maxRedemptions?: number;
      firstTimeCustomerOnly?: boolean;
      eligiblePlans?: HavelioPlan[];
      eligibleInterval?: BillingInterval;
      affiliateCampaignId?: string;
    },
    actorUserId: string,
  ): Promise<PromoCode> {
    const promoCode = await this.prisma.promoCode.create({
      data: { ...input, code: input.code.trim().toUpperCase() },
    });
    await this.auditService.log({
      userId: actorUserId,
      action: "billing.promo_code.created",
      entityType: "PromoCode",
      entityId: promoCode.id,
      metadata: { code: promoCode.code, affiliateCampaignId: input.affiliateCampaignId ?? null },
    });
    return promoCode;
  }

  listPromoCodes(affiliateCampaignId?: string): Promise<PromoCode[]> {
    return this.prisma.promoCode.findMany({
      ...(affiliateCampaignId ? { where: { affiliateCampaignId } } : {}),
      orderBy: { createdAt: "desc" },
    });
  }
}
