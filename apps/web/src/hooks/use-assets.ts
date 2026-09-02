"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  Asset,
  AssetDetail,
  AssetSummary,
  AssetTimelineEvent,
  PaginatedAssets,
} from "../types/asset";

export interface AssetListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  categoryId?: string | undefined;
  statusId?: string | undefined;
  isRentable?: boolean | undefined;
  isActive?: boolean | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  internalNumber?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
  customFields?: string | undefined;
}

export interface AssetInput {
  name: string;
  internalNumber: string;
  categoryId: string;
  statusId?: string;
  sku?: string | null;
  serialNumber?: string | null;
  barcode?: string | null;
  qrCodeValue?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  description?: string | null;
  purchaseDate?: string | null;
  purchasePriceMinor?: number;
  purchaseCurrency?: string | null;
  replacementValueMinor?: number;
  replacementCurrency?: string | null;
  currentLocationText?: string | null;
  conditionNotes?: string | null;
  isRentable?: boolean;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}

function assetsQueryKey(tenantId: string | null, params: AssetListParams): unknown[] {
  return ["assets", tenantId, params];
}

export function useAssets(tenantId: string | null, params: AssetListParams = {}) {
  return useQuery({
    queryKey: assetsQueryKey(tenantId, params),
    queryFn: () => apiClient.get<PaginatedAssets>(`/tenants/${tenantId}/assets`, { ...params }),
    enabled: !!tenantId,
  });
}

// Dashboard "Available assets" KPI — the canonical count from
// AssetsService.countAvailableNow (real-time AvailabilityService result,
// never a catalog isRentable/currentStatusId filter). See
// use-dashboard-stats.ts's availableAssets computation, the only consumer.
export function useAvailableAssetsCount(tenantId: string | null) {
  return useQuery({
    queryKey: ["assets", tenantId, "available-count"],
    queryFn: () => apiClient.get<{ count: number }>(`/tenants/${tenantId}/assets/available-count`),
    enabled: !!tenantId,
  });
}

export function useAsset(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["assets", tenantId, "detail", id],
    queryFn: () => apiClient.get<AssetDetail>(`/tenants/${tenantId}/assets/${id}`),
    enabled: !!tenantId && !!id,
  });
}

export function useAssetTimeline(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["assets", tenantId, "timeline", id],
    queryFn: () =>
      apiClient.get<AssetTimelineEvent[]>(`/tenants/${tenantId}/assets/${id}/timeline`),
    enabled: !!tenantId && !!id,
  });
}

export function useAssetSummary(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["assets", tenantId, "summary", id],
    queryFn: () => apiClient.get<AssetSummary>(`/tenants/${tenantId}/assets/${id}/summary`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateAsset(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetInput) =>
      apiClient.post<AssetDetail>(`/tenants/${tenantId}/assets`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
    },
  });
}

export function useUpdateAsset(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetInput> }) =>
      apiClient.patch<AssetDetail>(`/tenants/${tenantId}/assets/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
    },
  });
}

export function useDeleteAsset(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/assets/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
    },
  });
}

export function useChangeAssetStatus(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, statusId, reason }: { id: string; statusId: string; reason?: string }) =>
      apiClient.post<AssetDetail>(`/tenants/${tenantId}/assets/${id}/status`, { statusId, reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "timeline", variables.id],
      });
    },
  });
}

export function useChangeAssetLocation(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      newLocation,
      reason,
    }: {
      id: string;
      newLocation: string;
      reason?: string;
    }) =>
      apiClient.post<AssetDetail>(`/tenants/${tenantId}/assets/${id}/location`, {
        newLocation,
        reason,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "timeline", variables.id],
      });
    },
  });
}

export function useUploadAssetImage(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      file,
      isPrimary,
    }: {
      assetId: string;
      file: File;
      isPrimary?: boolean;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (isPrimary !== undefined) formData.append("isPrimary", String(isPrimary));
      return apiClient.postForm(`/tenants/${tenantId}/assets/${assetId}/images`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "detail", variables.assetId],
      });
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
    },
  });
}

export function useDeleteAssetImage(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, imageId }: { assetId: string; imageId: string }) =>
      apiClient.delete<void>(`/tenants/${tenantId}/assets/${assetId}/images/${imageId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "detail", variables.assetId],
      });
      void queryClient.invalidateQueries({ queryKey: ["assets", tenantId] });
    },
  });
}

export function useUploadAssetDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      assetId,
      file,
      documentType,
      title,
    }: {
      assetId: string;
      file: File;
      documentType: string;
      title: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);
      formData.append("title", title);
      return apiClient.postForm(`/tenants/${tenantId}/assets/${assetId}/documents`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "detail", variables.assetId],
      });
    },
  });
}

export function useDeleteAssetDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, documentId }: { assetId: string; documentId: string }) =>
      apiClient.delete<void>(`/tenants/${tenantId}/assets/${assetId}/documents/${documentId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["assets", tenantId, "detail", variables.assetId],
      });
    },
  });
}

export type { Asset };
