"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { AssetAvailabilityBlock, AssetAvailabilityBlockType } from "../types/rental";

const BASE_KEY = "asset-availability-blocks";

export interface CreateAvailabilityBlockInput {
  type: AssetAvailabilityBlockType;
  startAt: string;
  endAt: string;
  notes?: string | null;
  relatedRentalId?: string;
}

export function useAssetAvailabilityBlocks(tenantId: string | null, assetId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, assetId],
    queryFn: () =>
      apiClient.get<AssetAvailabilityBlock[]>(
        `/tenants/${tenantId}/assets/${assetId}/availability-blocks`,
      ),
    enabled: !!tenantId && !!assetId,
  });
}

export function useCreateAvailabilityBlock(tenantId: string | null, assetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAvailabilityBlockInput) =>
      apiClient.post<AssetAvailabilityBlock>(
        `/tenants/${tenantId}/assets/${assetId}/availability-blocks`,
        input,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, assetId] });
      void queryClient.invalidateQueries({ queryKey: ["rentals", tenantId, "availability"] });
    },
  });
}

export function useCancelAvailabilityBlock(tenantId: string | null, assetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, reason }: { blockId: string; reason?: string | undefined }) =>
      apiClient.post<AssetAvailabilityBlock>(
        `/tenants/${tenantId}/assets/${assetId}/availability-blocks/${blockId}/cancel`,
        { reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, assetId] });
      void queryClient.invalidateQueries({ queryKey: ["rentals", tenantId, "availability"] });
    },
  });
}
