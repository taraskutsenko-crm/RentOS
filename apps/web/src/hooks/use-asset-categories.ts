"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { AssetCategory, AssetCategoryTreeNode } from "../types/asset";

export interface PaginatedAssetCategories {
  items: AssetCategory[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssetCategoryInput {
  name: string;
  description?: string | null;
  code?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

const BASE_KEY = "asset-categories";

export function useAssetCategories(tenantId: string | null, params: { search?: string } = {}) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "list", params],
    queryFn: () =>
      apiClient.get<PaginatedAssetCategories>(`/tenants/${tenantId}/asset-categories`, {
        search: params.search,
        pageSize: 100,
      }),
    enabled: !!tenantId,
  });
}

export function useAssetCategoryTree(tenantId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "tree"],
    queryFn: () =>
      apiClient.get<AssetCategoryTreeNode[]>(`/tenants/${tenantId}/asset-categories/tree`),
    enabled: !!tenantId,
  });
}

export function useCreateAssetCategory(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetCategoryInput) =>
      apiClient.post<AssetCategory>(`/tenants/${tenantId}/asset-categories`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateAssetCategory(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetCategoryInput> }) =>
      apiClient.patch<AssetCategory>(`/tenants/${tenantId}/asset-categories/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteAssetCategory(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<void>(`/tenants/${tenantId}/asset-categories/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
