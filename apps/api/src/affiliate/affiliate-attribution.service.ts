import { Injectable, Logger } from "@nestjs/common";
import type { AffiliateAttribution, Prisma } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { PromoCodesService } from "../billing/promo-codes.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Havelio Affiliate/Partner domain (Stage 17) — which partner/campaign a
 * tenant is attributed to, if any. Deterministic V1 rule (see
 * docs/DECISIONS.md): the FIRST valid attribution wins and is never
 * silently replaced — enforced at the database level by
 * `AffiliateAttribution.tenantId @unique`, not just here. The one exception
 * is an explicit, audited platform-admin override (`recordAdminOverride`).
 */
@Injectable()
export class AffiliateAttributionService {
  private readonly logger = new Logger(AffiliateAttributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly promoCodesService: PromoCodesService,
  ) {}

  /**
   * Called once, inside AuthService.register's transaction. `code` may be a
   * PromoCode's human code OR an AffiliateCampaign's referral slug (the
   * frontend doesn't need to know which — see RegisterDto.affiliateCode's
   * own doc comment). A code that matches neither is silently ignored —
   * registration must never fail because of a stray/mistyped code.
   */
  async recordFromSignup(
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string | undefined,
  ): Promise<void> {
    if (!code) return;
    const trimmed = code.trim();
    if (!trimmed) return;

    // Try a referral-campaign slug first (case-sensitive, exactly as
    // provisioned), then a promo code (case-insensitive — see
    // PromoCodesService.findByCode).
    const campaign = await tx.affiliateCampaign.findUnique({ where: { slug: trimmed } });
    if (campaign) {
      if (campaign.status !== "ACTIVE") {
        this.logger.warn(`Referral slug "${trimmed}" matched a non-ACTIVE campaign — ignoring.`);
        return;
      }
      await this.createAttribution(tx, tenantId, {
        partnerId: campaign.partnerId,
        campaignId: campaign.id,
        promoCodeId: null,
        source: "REFERRAL_LINK",
      });
      return;
    }

    let promoCode;
    try {
      promoCode = await this.promoCodesService.validateForAttribution(trimmed);
    } catch {
      this.logger.warn(`Signup affiliateCode "${trimmed}" matched no active campaign or promo code — ignoring.`);
      return;
    }
    if (!promoCode.affiliateCampaignId) {
      // A plain marketing code (e.g. WELCOME20) with no affiliate behind it
      // — nothing to attribute, this is expected and not an error.
      return;
    }
    const linkedCampaign = await tx.affiliateCampaign.findUnique({
      where: { id: promoCode.affiliateCampaignId },
    });
    if (!linkedCampaign || linkedCampaign.status !== "ACTIVE") return;

    await this.createAttribution(tx, tenantId, {
      partnerId: linkedCampaign.partnerId,
      campaignId: linkedCampaign.id,
      promoCodeId: promoCode.id,
      source: "PROMO_CODE",
    });
  }

  private async createAttribution(
    tx: Prisma.TransactionClient,
    tenantId: string,
    data: { partnerId: string; campaignId: string | null; promoCodeId: string | null; source: "PROMO_CODE" | "REFERRAL_LINK" },
  ): Promise<void> {
    try {
      const attribution = await tx.affiliateAttribution.create({
        data: { tenantId, ...data },
      });
      await this.auditService.log(
        {
          tenantId,
          action: "billing.affiliate_attribution.established",
          entityType: "AffiliateAttribution",
          entityId: attribution.id,
          metadata: { partnerId: data.partnerId, campaignId: data.campaignId, source: data.source },
        },
        tx,
      );
    } catch (error) {
      // A unique-constraint violation here would mean this tenant already
      // has an attribution — impossible in the registration flow (a brand
      // new tenant), but defensively never let this crash registration.
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  async getForTenant(tenantId: string): Promise<AffiliateAttribution | null> {
    return this.prisma.affiliateAttribution.findUnique({ where: { tenantId } });
  }

  /**
   * The one explicit, audited override path (see this service's own doc
   * comment). Platform-admin only — enforced by PlatformAdminGuard on the
   * calling controller, not here; this method itself has no authorization
   * logic, matching every other service in this codebase (see
   * docs/DECISIONS.md "ordinary tenant OWNER cannot access Platform Admin").
   */
  async recordAdminOverride(
    tenantId: string,
    partnerId: string,
    campaignId: string | null,
    actorUserId: string,
  ): Promise<AffiliateAttribution> {
    const existing = await this.prisma.affiliateAttribution.findUnique({ where: { tenantId } });

    const attribution = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.affiliateAttribution.delete({ where: { id: existing.id } });
      }
      return tx.affiliateAttribution.create({
        data: { tenantId, partnerId, campaignId, promoCodeId: null, source: "ADMIN", createdByUserId: actorUserId },
      });
    });

    await this.auditService.log({
      tenantId,
      userId: actorUserId,
      action: "billing.affiliate_attribution.admin_override",
      entityType: "AffiliateAttribution",
      entityId: attribution.id,
      metadata: { previousPartnerId: existing?.partnerId ?? null, newPartnerId: partnerId },
    });

    return attribution;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
