"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { Payment, PaymentMethod } from "../types/invoice";

const BASE_KEY = "invoices";

export interface RecordPaymentInput {
  amountMinor: number;
  currency?: string | undefined;
  paymentDate: string;
  method?: PaymentMethod | undefined;
  reference?: string | null | undefined;
  notes?: string | null | undefined;
}

export function usePayments(tenantId: string | null, invoiceId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "payments", invoiceId],
    queryFn: () => apiClient.get<Payment[]>(`/tenants/${tenantId}/invoices/${invoiceId}/payments`),
    enabled: !!tenantId && !!invoiceId,
  });
}

export function useRecordPayment(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: RecordPaymentInput }) =>
      apiClient.post<Payment>(`/tenants/${tenantId}/invoices/${invoiceId}/payments`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payments", variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export interface MarkFullyPaidInput {
  paymentDate?: string | undefined;
  method?: PaymentMethod | undefined;
  reference?: string | null | undefined;
  notes?: string | null | undefined;
}

/** "Mark as paid" — one-click full payment. The remaining balance is always computed server-side; no amount is ever sent from here. */
export function useMarkFullyPaid(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: MarkFullyPaidInput }) =>
      apiClient.post<Payment>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payments/mark-fully-paid`,
        input,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payments", variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

/** Voids a mistaken payment — the row is never deleted, only marked reversed. */
export function useVoidPayment(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      paymentId,
      reason,
    }: {
      invoiceId: string;
      paymentId: string;
      reason: string;
    }) =>
      apiClient.post<Payment>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payments/${paymentId}/void`,
        { reason },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payments", variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export interface ApplyDepositInput {
  rentalDepositId: string;
  amountMinor: number;
  paymentDate?: string | undefined;
}

/** "Apply deposit to balance" — an explicit financial event, never automatic (see docs/PRODUCT_BIBLE.md). */
export function useApplyDeposit(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: ApplyDepositInput }) =>
      apiClient.post<Payment>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payments/apply-deposit`,
        input,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payments", variables.invoiceId],
      });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      // The rental's held-deposit balance changed too — broad invalidation
      // (no rentalId is known here) rather than guessing the exact key.
      void queryClient.invalidateQueries({ queryKey: ["rentals", tenantId, "deposit"] });
    },
  });
}
