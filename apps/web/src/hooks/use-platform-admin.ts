"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";

/**
 * Havelio PLATFORM administration (Stage 17 closure pass) — every hook here
 * calls `platform-admin/*`, gated server-side by PlatformAdminGuard (never
 * reachable by an ordinary tenant OWNER/ADMIN, regardless of tenant RBAC —
 * see docs/DECISIONS.md). Never confuse with tenant-scoped billing hooks
 * (`use-billing.ts`) — this is Havelio's OWN cross-tenant administration.
 */

export type AffiliateStatus = "ACTIVE" | "PAUSED" | "ENDED";

export interface AffiliatePartner {
  id: string;
  displayName: string;
  legalName: string | null;
  email: string;
  contactInfo: string | null;
  status: AffiliateStatus;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateCampaign {
  id: string;
  name: string;
  slug: string;
  status: AffiliateStatus;
  partnerId: string;
  commissionRateBp: number;
  commissionDurationMonths: number;
  createdAt: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValueBp: number | null;
  discountValueMinor: number | null;
  currency: string | null;
  duration: "ONCE" | "REPEATING" | "FOREVER";
  durationInMonths: number | null;
  isActive: boolean;
  maxRedemptions: number | null;
  redemptionCount: number;
  affiliateCampaignId: string | null;
  stripeCouponId: string | null;
  stripePromotionCodeId: string | null;
  provisioningStatus: "PENDING" | "PROVISIONED" | "FAILED";
  provisioningError: string | null;
}

export interface AffiliateAttribution {
  id: string;
  tenantId: string;
  partnerId: string;
  campaignId: string | null;
  promoCodeId: string | null;
  source: "PROMO_CODE" | "REFERRAL_LINK" | "ADMIN";
  attributedAt: string;
}

export interface PartnerAnalytics {
  registrations: number;
  trialsStarted: number;
  paidConversions: number;
  activeSubscribers: number;
  cancellations: number;
  byCurrency: Record<
    string,
    {
      eligibleRevenueMinor: number;
      commissionEarnedMinor: number;
      commissionPaidMinor: number;
      commissionPayableMinor: number;
    }
  >;
}

export interface AffiliatePayout {
  id: string;
  partnerId: string;
  amountMinor: number;
  currency: string;
  payoutDate: string;
  method: "BANK_TRANSFER" | "PAYPAL" | "OTHER";
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface PartnerDetail {
  partner: AffiliatePartner;
  campaigns: AffiliateCampaign[];
  analytics: PartnerAnalytics;
  balances: Record<string, number>;
}

export interface HavelioSubscriptionAdminRow {
  id: string;
  tenantId: string;
  plan: string;
  status: string;
  billingInterval: string | null;
  isGrandfathered: boolean;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
}

const PARTNERS_KEY = "platform-admin-partners";
const PARTNER_KEY = "platform-admin-partner";
const PROMO_CODES_KEY = "platform-admin-promo-codes";
const ATTRIBUTION_KEY = "platform-admin-attribution";
const PAYOUTS_KEY = "platform-admin-payouts";
const PAYABLE_KEY = "platform-admin-payable";
const SUBSCRIPTIONS_KEY = "platform-admin-subscriptions";

export function usePlatformAdminPartners() {
  return useQuery({
    queryKey: [PARTNERS_KEY],
    queryFn: () => apiClient.get<AffiliatePartner[]>("/platform-admin/affiliate/partners"),
  });
}

export function usePlatformAdminPartner(id: string | null) {
  return useQuery({
    queryKey: [PARTNER_KEY, id],
    queryFn: () => apiClient.get<PartnerDetail>(`/platform-admin/affiliate/partners/${id}`),
    enabled: !!id,
  });
}

export function useCreatePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayName: string; email: string; legalName?: string; contactInfo?: string; internalNotes?: string }) =>
      apiClient.post<AffiliatePartner>("/platform-admin/affiliate/partners", input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [PARTNERS_KEY] }),
  });
}

export function useUpdatePartnerStatus(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: AffiliateStatus) =>
      apiClient.patch<AffiliatePartner>(`/platform-admin/affiliate/partners/${id}/status`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PARTNERS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PARTNER_KEY, id] });
    },
  });
}

export function useCreateCampaign(partnerId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      slug: string;
      commissionRateBp: number;
      commissionDurationMonths: number;
    }) => apiClient.post<AffiliateCampaign>(`/platform-admin/affiliate/partners/${partnerId}/campaigns`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [PARTNER_KEY, partnerId] }),
  });
}

export function usePlatformAdminPromoCodes(campaignId?: string) {
  return useQuery({
    queryKey: [PROMO_CODES_KEY, campaignId],
    queryFn: () =>
      apiClient.get<PromoCode[]>(
        `/platform-admin/affiliate/promo-codes${campaignId ? `?campaignId=${campaignId}` : ""}`,
      ),
    enabled: !!campaignId,
  });
}

export function useCreatePromoCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      code: string;
      discountType: "PERCENTAGE" | "FIXED_AMOUNT";
      discountValueBp?: number;
      discountValueMinor?: number;
      currency?: string;
      duration: "ONCE" | "REPEATING" | "FOREVER";
      durationInMonths?: number;
      affiliateCampaignId?: string;
    }) => apiClient.post<PromoCode>("/platform-admin/affiliate/promo-codes", input),
    onSuccess: (_data, variables) =>
      void queryClient.invalidateQueries({ queryKey: [PROMO_CODES_KEY, variables.affiliateCampaignId] }),
  });
}

/** Admin-facing recovery for a PENDING/FAILED promo code — see PromoCodesService.provisionStripeObjects. */
export function useRetryPromoCodeProvisioning(campaignId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (promoCodeId: string) =>
      apiClient.post<PromoCode>(`/platform-admin/affiliate/promo-codes/${promoCodeId}/retry-provisioning`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [PROMO_CODES_KEY, campaignId] }),
  });
}

export function useAttribution(tenantId: string) {
  return useQuery({
    queryKey: [ATTRIBUTION_KEY, tenantId],
    queryFn: () => apiClient.get<AffiliateAttribution | null>(`/platform-admin/affiliate/attributions/${tenantId}`),
    enabled: !!tenantId,
    retry: false,
  });
}

export function usePartnerPayouts(partnerId: string | null) {
  return useQuery({
    queryKey: [PAYOUTS_KEY, partnerId],
    queryFn: () => apiClient.get<AffiliatePayout[]>(`/platform-admin/affiliate/partners/${partnerId}/payouts`),
    enabled: !!partnerId,
  });
}

export function usePartnerPayable(partnerId: string | null, currency: string) {
  return useQuery({
    queryKey: [PAYABLE_KEY, partnerId, currency],
    queryFn: () =>
      apiClient.get<{ earnedMinor: number; adjustmentsMinor: number; paidMinor: number; payableMinor: number }>(
        `/platform-admin/affiliate/partners/${partnerId}/payable?currency=${currency}`,
      ),
    enabled: !!partnerId,
  });
}

export function useRecordPayout(partnerId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      amountMinor: number;
      currency: string;
      payoutDate: string;
      method: "BANK_TRANSFER" | "PAYPAL" | "OTHER";
      reference?: string;
      note?: string;
    }) => apiClient.post<AffiliatePayout>(`/platform-admin/affiliate/partners/${partnerId}/payouts`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAYOUTS_KEY, partnerId] });
      void queryClient.invalidateQueries({ queryKey: [PAYABLE_KEY, partnerId] });
      void queryClient.invalidateQueries({ queryKey: [PARTNER_KEY, partnerId] });
    },
  });
}

export function usePlatformAdminSubscriptions() {
  return useQuery({
    queryKey: [SUBSCRIPTIONS_KEY],
    queryFn: () =>
      apiClient.get<{ subscriptions: HavelioSubscriptionAdminRow[] }>("/platform-admin/billing/subscriptions"),
  });
}
