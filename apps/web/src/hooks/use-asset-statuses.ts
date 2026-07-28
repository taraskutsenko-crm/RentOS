"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { AssetStatusDefinition } from "../types/asset";

export interface AssetStatusInput {
  name: string;
  code: string;
  description?: string | null;
  colorToken?: string | null;
  icon?: string | null;
  isAvailableForRental?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

const BASE_KEY = "asset-statuses";

export function useAssetStatuses(tenantId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId],
    queryFn: () => apiClient.get<AssetStatusDefinition[]>(`/tenants/${tenantId}/asset-statuses`),
    enabled: !!tenantId,
  });
}

export function useCreateAssetStatus(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetStatusInput) =>
      apiClient.post<AssetStatusDefinition>(`/tenants/${tenantId}/asset-statuses`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateAssetStatus(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetStatusInput> }) =>
      apiClient.patch<AssetStatusDefinition>(`/tenants/${tenantId}/asset-statuses/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteAssetStatus(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/asset-statuses/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
