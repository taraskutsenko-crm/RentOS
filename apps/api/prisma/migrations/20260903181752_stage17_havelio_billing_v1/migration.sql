-- CreateEnum
CREATE TYPE "HavelioPlan" AS ENUM ('STARTER', 'BUSINESS', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "HavelioSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PromoDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AttributionSource" AS ENUM ('PROMO_CODE', 'REFERRAL_LINK', 'ADMIN');

-- CreateEnum
CREATE TYPE "CommissionEventType" AS ENUM ('COMMISSION_EARNED', 'COMMISSION_REVERSED', 'MANUAL_ADJUSTMENT', 'PAYOUT');

-- CreateEnum
CREATE TYPE "AffiliatePayoutMethod" AS ENUM ('BANK_TRANSFER', 'PAYPAL', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "havelio_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "HavelioPlan" NOT NULL,
    "billingInterval" "BillingInterval",
    "status" "HavelioSubscriptionStatus" NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "isGrandfathered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "havelio_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValueBp" INTEGER,
    "discountValueMinor" INTEGER,
    "currency" VARCHAR(3),
    "duration" "PromoDuration" NOT NULL,
    "durationInMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "firstTimeCustomerOnly" BOOLEAN NOT NULL DEFAULT true,
    "eligiblePlans" "HavelioPlan"[],
    "eligibleInterval" "BillingInterval",
    "stripeCouponId" TEXT,
    "stripePromotionCodeId" TEXT,
    "affiliateCampaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_partners" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT NOT NULL,
    "contactInfo" TEXT,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "internalNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'ACTIVE',
    "partnerId" TEXT NOT NULL,
    "commissionRateBp" INTEGER NOT NULL,
    "commissionDurationMonths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_attributions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "promoCodeId" TEXT,
    "source" "AttributionSource" NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_commission_entries" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "eventType" "CommissionEventType" NOT NULL,
    "stripeInvoiceId" TEXT,
    "currency" VARCHAR(3) NOT NULL,
    "eligibleRevenueMinor" INTEGER NOT NULL DEFAULT 0,
    "commissionRateBp" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" INTEGER NOT NULL,
    "reversesEntryId" TEXT,
    "payoutId" TEXT,
    "note" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payouts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "payoutDate" TIMESTAMP(3) NOT NULL,
    "method" "AffiliatePayoutMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,

    CONSTRAINT "legal_acceptance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "havelio_subscriptions_tenantId_key" ON "havelio_subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "havelio_subscriptions_stripeSubscriptionId_key" ON "havelio_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "havelio_subscriptions_status_idx" ON "havelio_subscriptions"("status");

-- CreateIndex
CREATE INDEX "havelio_subscriptions_stripeCustomerId_idx" ON "havelio_subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_affiliateCampaignId_idx" ON "promo_codes"("affiliateCampaignId");

-- CreateIndex
CREATE INDEX "affiliate_campaigns_partnerId_idx" ON "affiliate_campaigns"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_attributions_tenantId_key" ON "affiliate_attributions"("tenantId");

-- CreateIndex
CREATE INDEX "affiliate_attributions_partnerId_idx" ON "affiliate_attributions"("partnerId");

-- CreateIndex
CREATE INDEX "affiliate_attributions_campaignId_idx" ON "affiliate_attributions"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commission_entries_payoutId_key" ON "affiliate_commission_entries"("payoutId");

-- CreateIndex
CREATE INDEX "affiliate_commission_entries_partnerId_earnedAt_idx" ON "affiliate_commission_entries"("partnerId", "earnedAt");

-- CreateIndex
CREATE INDEX "affiliate_commission_entries_tenantId_idx" ON "affiliate_commission_entries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commission_entries_stripeInvoiceId_eventType_key" ON "affiliate_commission_entries"("stripeInvoiceId", "eventType");

-- CreateIndex
CREATE INDEX "affiliate_payouts_partnerId_payoutDate_idx" ON "affiliate_payouts"("partnerId", "payoutDate");

-- CreateIndex
CREATE INDEX "legal_acceptance_records_tenantId_idx" ON "legal_acceptance_records"("tenantId");

-- AddForeignKey
ALTER TABLE "havelio_subscriptions" ADD CONSTRAINT "havelio_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_affiliateCampaignId_fkey" FOREIGN KEY ("affiliateCampaignId") REFERENCES "affiliate_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_partners" ADD CONSTRAINT "affiliate_partners_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_campaigns" ADD CONSTRAINT "affiliate_campaigns_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "affiliate_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "affiliate_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "affiliate_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "affiliate_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "affiliate_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "affiliate_commission_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_entries" ADD CONSTRAINT "affiliate_commission_entries_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "affiliate_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "affiliate_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptance_records" ADD CONSTRAINT "legal_acceptance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptance_records" ADD CONSTRAINT "legal_acceptance_records_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
