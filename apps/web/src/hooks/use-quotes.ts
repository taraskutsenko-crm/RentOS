"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  ConvertQuoteResult,
  PaginatedQuotes,
  Quote,
  QuoteBillingMode,
  QuoteDiscountType,
  QuoteItemType,
  QuoteStatus,
  QuoteTimelineEvent,
  SendQuoteResult,
} from "../types/quote";
import type { PartialMonthPolicy } from "../types/rental";

export interface QuoteListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: QuoteStatus | undefined;
  customerId?: string | undefined;
  createdByUserId?: string | undefined;
  issueDateFrom?: string | undefined;
  issueDateTo?: string | undefined;
  validUntilFrom?: string | undefined;
  validUntilTo?: string | undefined;
  plannedStartFrom?: string | undefined;
  plannedStartTo?: string | undefined;
  totalMinorFrom?: number | undefined;
  totalMinorTo?: number | undefined;
  expired?: boolean | undefined;
  converted?: boolean | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

export interface QuoteItemInput {
  itemType: QuoteItemType;
  assetId?: string | undefined;
  name: string;
  description?: string | null | undefined;
  quantity?: number | undefined;
  unit?: string | null | undefined;
  billingMode: QuoteBillingMode;
  unitPriceMinor?: number | undefined;
  dailyPriceMinor?: number | undefined;
  weeklyPriceMinor?: number | undefined;
  monthlyPriceMinor?: number | undefined;
  customPriceMinor?: number | undefined;
  discountType?: QuoteDiscountType | undefined;
  discountValue?: number | undefined;
  taxRateBp?: number | undefined;
  depositMinor?: number | undefined;
  sortOrder?: number | undefined;
  notes?: string | null | undefined;
  /** Only meaningful for MONTHLY — see DECISIONS.md D-072. */
  partialMonthPolicy?: PartialMonthPolicy | undefined;
}

export interface QuoteInput {
  customerId: string;
  issueDate?: string | undefined;
  validUntil: string;
  plannedStart: string;
  plannedEnd: string;
  currency?: string | undefined;
  discountType?: QuoteDiscountType | undefined;
  discountValue?: number | undefined;
  customerNotes?: string | null | undefined;
  internalNotes?: string | null | undefined;
  termsAndConditions?: string | null | undefined;
  items?: QuoteItemInput[] | undefined;
}

const BASE_KEY = "quotes";

export function useQuotes(tenantId: string | null, params: QuoteListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, params],
    queryFn: () => apiClient.get<PaginatedQuotes>(`/tenants/${tenantId}/quotes`, { ...params }),
    enabled: !!tenantId,
  });
}

export function useQuote(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "detail", id],
    queryFn: () => apiClient.get<Quote>(`/tenants/${tenantId}/quotes/${id}`),
    enabled: !!tenantId && !!id,
  });
}

export function useQuoteTimeline(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "history", id],
    queryFn: () => apiClient.get<QuoteTimelineEvent[]>(`/tenants/${tenantId}/quotes/${id}/history`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateQuote(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuoteInput) => apiClient.post<Quote>(`/tenants/${tenantId}/quotes`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateQuote(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<QuoteInput> }) =>
      apiClient.patch<Quote>(`/tenants/${tenantId}/quotes/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteQuote(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/quotes/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

function useQuoteLifecycleAction<TResult = Quote>(
  tenantId: string | null,
  action: "accept" | "reject" | "cancel" | "duplicate" | "convert-to-rental",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; [key: string]: unknown }) =>
      apiClient.post<TResult>(`/tenants/${tenantId}/quotes/${id}/${action}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.id],
      });
    },
  });
}

export function useAcceptQuote(tenantId: string | null) {
  return useQuoteLifecycleAction(tenantId, "accept");
}

export function useRejectQuote(tenantId: string | null) {
  return useQuoteLifecycleAction(tenantId, "reject");
}

export function useCancelQuote(tenantId: string | null) {
  return useQuoteLifecycleAction(tenantId, "cancel");
}

export function useDuplicateQuote(tenantId: string | null) {
  return useQuoteLifecycleAction(tenantId, "duplicate");
}

export function useConvertQuoteToRental(tenantId: string | null) {
  return useQuoteLifecycleAction<ConvertQuoteResult>(tenantId, "convert-to-rental");
}

/**
 * "Rental -> Generate Commercial Quote" — builds/reuses the real canonical
 * Quote for a Rental (QuotesService.createFromRental). Idempotent
 * server-side: calling this again for the same rental returns the
 * already-generated Quote rather than creating a duplicate.
 */
export function useGenerateQuoteFromRental(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rentalId: string) =>
      apiClient.post<Quote>(`/tenants/${tenantId}/quotes/from-rental/${rentalId}`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useSendQuote(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      recipientEmail,
      message,
    }: {
      id: string;
      recipientEmail?: string;
      message?: string;
    }) =>
      apiClient.post<SendQuoteResult>(`/tenants/${tenantId}/quotes/${id}/send`, {
        recipientEmail,
        message,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.id],
      });
    },
  });
}

export function useRegenerateQuotePdf(tenantId: string | null) {
  return useMutation({
    mutationFn: (id: string) => apiClient.post<void>(`/tenants/${tenantId}/quotes/${id}/pdf`),
  });
}

export function quotePdfUrl(tenantId: string | null, id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/quotes/${id}/pdf`;
}
