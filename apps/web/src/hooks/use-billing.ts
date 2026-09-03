"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";

/**
 * Havelio Billing (Stage 17) — the tenant's OWN subscription to Havelio
 * itself. Never confuse with rental-finance hooks (invoices/payments) —
 * those are a completely separate domain (see docs/DECISIONS.md).
 */

export type HavelioPlan = "STARTER" | "BUSINESS" | "PROFESSIONAL" | "ENTERPRISE";
export type BillingInterval = "MONTHLY" | "ANNUAL";
export type HavelioSubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "INCOMPLETE";

export interface PlanLimits {
  maxUsers: number | null;
  maxActiveAssets: number | null;
  maxLocations: number | null;
}

export interface PlanDefinition {
  plan: HavelioPlan;
  name: string;
  monthlyPriceMinor: number | null;
  annualPriceMinor: number | null;
  currency: string;
  limits: PlanLimits;
  features: string[];
  isMostPopular: boolean;
  isContactSalesOnly: boolean;
}

export interface HavelioSubscription {
  id: string;
  tenantId: string;
  plan: HavelioPlan;
  billingInterval: BillingInterval | null;
  status: HavelioSubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  scheduledPlan: HavelioPlan | null;
  scheduledBillingInterval: BillingInterval | null;
  isGrandfathered: boolean;
}

export interface BillingSubscriptionResponse {
  subscription: HavelioSubscription;
  access: "GRANTED" | "RESTRICTED";
  plan: PlanDefinition | null;
  usage: { assets: number; users: number };
  stripeConfigured: boolean;
}

export interface DiscountPreview {
  code: string;
  currency: string;
  originalPriceMinor: number;
  discountedPriceMinor: number;
  thenPriceMinor: number;
  duration: "ONCE" | "REPEATING" | "FOREVER";
  durationInMonths: number | null;
}

const PLANS_KEY = "billing-plans";
const SUBSCRIPTION_KEY = "billing-subscription";

export function usePlans() {
  return useQuery({
    queryKey: [PLANS_KEY],
    queryFn: () => apiClient.get<{ plans: PlanDefinition[]; stripeConfigured: boolean }>("/billing/plans"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBillingSubscription(tenantId: string | null) {
  return useQuery({
    queryKey: [SUBSCRIPTION_KEY, tenantId],
    queryFn: () => apiClient.get<BillingSubscriptionResponse>(`/tenants/${tenantId}/billing/subscription`),
    enabled: !!tenantId,
  });
}

export function useCreateCheckoutSession(tenantId: string | null) {
  return useMutation({
    mutationFn: (input: { plan: HavelioPlan; interval: BillingInterval; promoCode?: string }) =>
      apiClient.post<{ url: string }>(`/tenants/${tenantId}/billing/checkout`, input),
  });
}

export function useCreateBillingPortalSession(tenantId: string | null) {
  return useMutation({
    mutationFn: () => apiClient.post<{ url: string }>(`/tenants/${tenantId}/billing/portal`),
  });
}

export function useCancelSubscription(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<HavelioSubscription>(`/tenants/${tenantId}/billing/cancel`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_KEY, tenantId] }),
  });
}

export function useResumeSubscription(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<HavelioSubscription>(`/tenants/${tenantId}/billing/resume`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_KEY, tenantId] }),
  });
}

export function useChangePlan(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { plan: HavelioPlan; interval: BillingInterval }) =>
      apiClient.post<HavelioSubscription>(`/tenants/${tenantId}/billing/change-plan`, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_KEY, tenantId] }),
  });
}

export function usePreviewPromoCode(
  tenantId: string | null,
  code: string,
  plan: HavelioPlan,
  interval: BillingInterval,
) {
  return useQuery({
    queryKey: ["billing-promo-preview", tenantId, code, plan, interval],
    queryFn: () =>
      apiClient.get<DiscountPreview>(
        `/tenants/${tenantId}/billing/promo-code/${encodeURIComponent(code)}/preview?plan=${plan}&interval=${interval}`,
      ),
    enabled: !!tenantId && code.trim().length >= 3,
    retry: false,
  });
}
