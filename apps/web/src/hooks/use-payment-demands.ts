"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { PaymentDemand, PaymentDemandEmailDelivery } from "../types/invoice";

const BASE_KEY = "invoices";

export function paymentDemandPdfUrl(
  tenantId: string,
  invoiceId: string,
  paymentDemandId: string,
): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/invoices/${invoiceId}/payment-demands/${paymentDemandId}/pdf`;
}

export function usePaymentDemands(tenantId: string | null, invoiceId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "payment-demands", invoiceId],
    queryFn: () =>
      apiClient.get<PaymentDemand[]>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payment-demands`,
      ),
    enabled: !!tenantId && !!invoiceId,
  });
}

export interface CreatePaymentDemandInput {
  requestedDeadline: string;
}

export function useCreatePaymentDemand(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: CreatePaymentDemandInput }) =>
      apiClient.post<PaymentDemand>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payment-demands`,
        input,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payment-demands", variables.invoiceId],
      });
    },
  });
}

export function usePaymentDemandEmailDeliveries(
  tenantId: string | null,
  invoiceId: string | null,
  paymentDemandId: string | null,
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "payment-demands", paymentDemandId, "email-deliveries"],
    queryFn: () =>
      apiClient.get<PaymentDemandEmailDelivery[]>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payment-demands/${paymentDemandId}/email-deliveries`,
      ),
    enabled: !!tenantId && !!invoiceId && !!paymentDemandId,
  });
}

export function useSendPaymentDemandEmail(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      paymentDemandId,
    }: {
      invoiceId: string;
      paymentDemandId: string;
    }) =>
      apiClient.post<{ sent: boolean; error?: string }>(
        `/tenants/${tenantId}/invoices/${invoiceId}/payment-demands/${paymentDemandId}/email`,
        {},
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "payment-demands", variables.invoiceId],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          BASE_KEY,
          tenantId,
          "payment-demands",
          variables.paymentDemandId,
          "email-deliveries",
        ],
      });
    },
  });
}
