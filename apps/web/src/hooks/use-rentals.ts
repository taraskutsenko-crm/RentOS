"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  AssetAvailabilityResult,
  DepositPaymentMethod,
  PaginatedRentals,
  PartialMonthPolicy,
  RentalAttentionSummary,
  RentalBillingMode,
  RentalDeposit,
  RentalDetail,
  RentalStatus,
  RentalTimelineEvent,
} from "../types/rental";

/** Matches apps/api's RENTAL_ATTENTION_FILTERS (query-rentals.dto.ts). */
export type RentalAttentionFilter = "overdue" | "endingToday" | "endingTomorrow";

export interface RentalListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: RentalStatus | undefined;
  customerId?: string | undefined;
  assetId?: string | undefined;
  attention?: RentalAttentionFilter | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

export interface RentalItemInput {
  assetId: string;
  quantity?: number;
  billingMode: RentalBillingMode;
  dailyPriceMinor?: number;
  weeklyPriceMinor?: number;
  monthlyPriceMinor?: number;
  customPriceMinor?: number;
  depositMinor?: number;
  discountMinor?: number;
  /** Integer basis points (2300 = 23.00%) — see DECISIONS.md D-090. */
  taxRateBp?: number;
  notes?: string | null;
  /** Only meaningful for MONTHLY — see DECISIONS.md D-072. */
  partialMonthPolicy?: PartialMonthPolicy;
}

export interface RentalInput {
  customerId: string;
  plannedStart: string;
  plannedEnd: string;
  currency?: string;
  discountMinor?: number;
  notes?: string | null;
  internalNotes?: string | null;
  items?: RentalItemInput[];
}

const BASE_KEY = "rentals";

export function useRentals(tenantId: string | null, params: RentalListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, params],
    queryFn: () => apiClient.get<PaginatedRentals>(`/tenants/${tenantId}/rentals`, { ...params }),
    enabled: !!tenantId,
  });
}

export function useRental(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "detail", id],
    queryFn: () => apiClient.get<RentalDetail>(`/tenants/${tenantId}/rentals/${id}`),
    enabled: !!tenantId && !!id,
  });
}

/** Dashboard "Rental attention" section — see RentalsService.getAttentionSummary. */
export function useRentalAttentionSummary(tenantId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "attention-summary"],
    queryFn: () =>
      apiClient.get<RentalAttentionSummary>(`/tenants/${tenantId}/rentals/attention-summary`),
    enabled: !!tenantId,
  });
}

export function useRentalTimeline(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "timeline", id],
    queryFn: () =>
      apiClient.get<RentalTimelineEvent[]>(`/tenants/${tenantId}/rentals/${id}/timeline`),
    enabled: !!tenantId && !!id,
  });
}

export function useAvailability(
  tenantId: string | null,
  params: {
    assetIds: string[];
    plannedStart: string;
    plannedEnd: string;
    excludeRentalId?: string;
  } | null,
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "availability", params],
    queryFn: () =>
      apiClient.get<{ results: AssetAvailabilityResult[] }>(
        `/tenants/${tenantId}/rentals/availability`,
        {
          assetIds: params!.assetIds.join(","),
          plannedStart: params!.plannedStart,
          plannedEnd: params!.plannedEnd,
          excludeRentalId: params?.excludeRentalId,
        },
      ),
    enabled:
      !!tenantId &&
      !!params &&
      params.assetIds.length > 0 &&
      !!params.plannedStart &&
      !!params.plannedEnd,
  });
}

export function useCreateRental(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalInput) =>
      apiClient.post<RentalDetail>(`/tenants/${tenantId}/rentals`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateRental(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RentalInput> }) =>
      apiClient.patch<RentalDetail>(`/tenants/${tenantId}/rentals/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteRental(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/rentals/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

function useRentalLifecycleAction(tenantId: string | null, action: "reserve" | "start" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post<RentalDetail>(`/tenants/${tenantId}/rentals/${id}/${action}`, { reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "timeline", variables.id],
      });
    },
  });
}

export function useReserveRental(tenantId: string | null) {
  return useRentalLifecycleAction(tenantId, "reserve");
}

export function useStartRental(tenantId: string | null) {
  return useRentalLifecycleAction(tenantId, "start");
}

export function useCancelRental(tenantId: string | null) {
  return useRentalLifecycleAction(tenantId, "cancel");
}

export function useReturnRental(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemIds, reason }: { id: string; itemIds?: string[]; reason?: string }) =>
      apiClient.post<RentalDetail>(`/tenants/${tenantId}/rentals/${id}/return`, {
        itemIds,
        reason,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "timeline", variables.id],
      });
    },
  });
}

export function useRentalDeposit(tenantId: string | null, rentalId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "deposit", rentalId],
    queryFn: () =>
      apiClient.get<RentalDeposit | Record<string, never>>(
        `/tenants/${tenantId}/rentals/${rentalId}/deposit`,
      ),
    enabled: !!tenantId && !!rentalId,
    select: (data) => (data && "id" in data ? (data as RentalDeposit) : null),
  });
}

export interface RecordDepositReceiptInput {
  receivedAt: string;
  receivedAmountMinor: number;
  receivedMethod: DepositPaymentMethod;
  receivedReference?: string | null;
  notes?: string | null;
}

export function useRecordDepositReceipt(tenantId: string | null, rentalId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDepositReceiptInput) =>
      apiClient.post<RentalDeposit>(
        `/tenants/${tenantId}/rentals/${rentalId}/deposit/receive`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, "deposit", rentalId] });
    },
  });
}

export interface RecordDepositReturnInput {
  returnedAt: string;
  returnedAmountMinor: number;
  retainedAmountMinor: number;
  retentionReason?: string | null;
  notes?: string | null;
}

export function useRecordDepositReturn(tenantId: string | null, rentalId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDepositReturnInput) =>
      apiClient.post<RentalDeposit>(
        `/tenants/${tenantId}/rentals/${rentalId}/deposit/return`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, "deposit", rentalId] });
    },
  });
}
