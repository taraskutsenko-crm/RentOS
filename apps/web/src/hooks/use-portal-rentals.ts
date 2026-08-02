"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  PaginatedPortalRentals,
  PortalRental,
  PortalRentalTimelineEvent,
} from "../types/portal";

export interface PortalRentalListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  status?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

const BASE_KEY = "portal-rentals";

export function usePortalRentals(params: PortalRentalListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, params],
    queryFn: () => apiClient.get<PaginatedPortalRentals>("/portal/rentals", { ...params }),
  });
}

export function usePortalRental(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "detail", id],
    queryFn: () => apiClient.get<PortalRental>(`/portal/rentals/${id}`),
    enabled: !!id,
  });
}

export function usePortalRentalTimeline(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "timeline", id],
    queryFn: () => apiClient.get<PortalRentalTimelineEvent[]>(`/portal/rentals/${id}/timeline`),
    enabled: !!id,
  });
}

export function portalRentalDocumentsZipUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/rentals/${id}/documents/zip`;
}

export function portalRentalQrCodeUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/rentals/${id}/qr-code`;
}
