"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { CustomerPortalMessage } from "../types/portal";

const BASE_KEY = "portal-messages";

export function usePortalMessages(rentalId?: string) {
  return useQuery({
    queryKey: [BASE_KEY, rentalId],
    queryFn: () => apiClient.get<CustomerPortalMessage[]>("/portal/messages", { rentalId }),
    refetchInterval: 15_000,
  });
}

export function useSendPortalMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, rentalId }: { body: string; rentalId?: string | undefined }) =>
      apiClient.post<CustomerPortalMessage>("/portal/messages", { body, rentalId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["portal-dashboard"] });
    },
  });
}
