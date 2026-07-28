"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  AssetCustomFieldDefinition,
  AssetFieldOption,
  AssetFieldType,
  AssetValidationRules,
} from "../types/asset";

export interface PaginatedAssetCustomFields {
  items: AssetCustomFieldDefinition[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetCustomFieldInput {
  name: string;
  key: string;
  description?: string | null;
  categoryId?: string | null;
  fieldType: AssetFieldType;
  isRequired?: boolean;
  isActive?: boolean;
  isFilterable?: boolean;
  isSearchable?: boolean;
  sortOrder?: number;
  validationRules?: AssetValidationRules;
  options?: AssetFieldOption[];
}

const BASE_KEY = "asset-custom-fields";

export function useAssetCustomFields(
  tenantId: string | null,
  params: { categoryId?: string } = {},
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "list", params],
    queryFn: () =>
      apiClient.get<PaginatedAssetCustomFields>(`/tenants/${tenantId}/asset-custom-fields`, {
        categoryId: params.categoryId,
        pageSize: 100,
      }),
    enabled: !!tenantId,
  });
}

export function useAssetCustomFieldsForCategory(
  tenantId: string | null,
  categoryId: string | null,
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "for-category", categoryId],
    queryFn: () =>
      apiClient.get<AssetCustomFieldDefinition[]>(
        `/tenants/${tenantId}/asset-custom-fields/for-category/${categoryId}`,
      ),
    enabled: !!tenantId && !!categoryId,
  });
}

export function useCreateAssetCustomField(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetCustomFieldInput) =>
      apiClient.post<AssetCustomFieldDefinition>(`/tenants/${tenantId}/asset-custom-fields`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateAssetCustomField(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetCustomFieldInput> }) =>
      apiClient.patch<AssetCustomFieldDefinition>(
        `/tenants/${tenantId}/asset-custom-fields/${id}`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteAssetCustomField(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<void>(`/tenants/${tenantId}/asset-custom-fields/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
