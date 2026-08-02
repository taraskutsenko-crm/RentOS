"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { RentalDamageReport } from "../types/portal";

const BASE_KEY = "portal-damage-reports";

export function usePortalDamageReports(rentalId?: string) {
  return useQuery({
    queryKey: [BASE_KEY, rentalId],
    queryFn: () => apiClient.get<RentalDamageReport[]>("/portal/damage-reports", { rentalId }),
  });
}

export function usePortalDamageReport(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "detail", id],
    queryFn: () => apiClient.get<RentalDamageReport>(`/portal/damage-reports/${id}`),
    enabled: !!id,
  });
}

export function useCreatePortalDamageReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rentalId,
      description,
      assetId,
    }: {
      rentalId: string;
      description: string;
      assetId?: string | undefined;
    }) =>
      apiClient.post<RentalDamageReport>(`/portal/damage-reports/rentals/${rentalId}`, {
        description,
        assetId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });
}

export function useUploadPortalDamageReportPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, file }: { reportId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.postForm(`/portal/damage-reports/${reportId}/photos`, formData);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, "detail", variables.reportId] });
    },
  });
}

export function portalDamageReportPhotoUrl(reportId: string, photoId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/damage-reports/${reportId}/photos/${photoId}`;
}
