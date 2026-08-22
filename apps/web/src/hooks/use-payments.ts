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
