"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { EInvoiceConnection, EInvoiceProviderType } from "../types/einvoice";

const BASE_KEY = "einvoice-connections";

export function useEInvoiceConnection(tenantId: string | null, provider: EInvoiceProviderType) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, provider],
    queryFn: () =>
      apiClient.get<EInvoiceConnection>(`/tenants/${tenantId}/einvoice-connections/${provider}`),
    enabled: !!tenantId,
  });
}

export function useConnectEInvoiceProvider(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      credentials,
      environment,
    }: {
      provider: EInvoiceProviderType;
      credentials: string;
      environment?: string | undefined;
    }) =>
      apiClient.post<EInvoiceConnection>(
        `/tenants/${tenantId}/einvoice-connections/${provider}/connect`,
        { credentials, environment },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, variables.provider] });
    },
  });
}

export function useDisconnectEInvoiceProvider(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: EInvoiceProviderType) =>
      apiClient.post<EInvoiceConnection>(
        `/tenants/${tenantId}/einvoice-connections/${provider}/disconnect`,
      ),
    onSuccess: (_data, provider) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, provider] });
    },
  });
}
