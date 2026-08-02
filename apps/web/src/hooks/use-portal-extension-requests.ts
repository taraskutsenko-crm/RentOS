"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { RentalExtensionRequest } from "../types/portal";

const BASE_KEY = "portal-extension-requests";

export function usePortalExtensionRequests(rentalId?: string) {
  return useQuery({
    queryKey: [BASE_KEY, rentalId],
    queryFn: () =>
      apiClient.get<RentalExtensionRequest[]>("/portal/extension-requests", { rentalId }),
  });
}

export function useCreatePortalExtensionRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      rentalId,
      requestedEnd,
      message,
    }: {
      rentalId: string;
      requestedEnd: string;
      message?: string | undefined;
    }) =>
      apiClient.post<RentalExtensionRequest>(`/portal/extension-requests/rentals/${rentalId}`, {
        requestedEnd,
        message,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["portal-rentals"] });
      void queryClient.invalidateQueries({ queryKey: ["portal-dashboard"] });
    },
  });
}
