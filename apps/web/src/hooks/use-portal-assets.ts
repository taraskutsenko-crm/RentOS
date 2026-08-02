"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { PortalAsset } from "../types/portal";

const BASE_KEY = "portal-assets";

export function usePortalAsset(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "detail", id],
    queryFn: () => apiClient.get<PortalAsset>(`/portal/assets/${id}`),
    enabled: !!id,
  });
}

export function portalAssetImageUrl(assetId: string, imageId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/assets/${assetId}/images/${imageId}`;
}
