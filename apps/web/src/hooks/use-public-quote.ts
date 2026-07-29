"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { PublicQuote } from "../types/quote";

const BASE_KEY = "public-quote";

/**
 * No tenantId, no auth cookie dependency — the token alone identifies the
 * quote (see QuotesService.loadByToken). apiClient's default
 * `credentials: "include"` is harmless here: public endpoints never read
 * the cookie, so this works identically whether or not the visitor happens
 * to be logged into RentOS in the same browser.
 */
export function usePublicQuote(token: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, token],
    queryFn: () => apiClient.get<PublicQuote>(`/public/quotes/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptPublicQuote(token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (acceptedBy?: string) =>
      apiClient.post<PublicQuote>(`/public/quotes/${token}/accept`, { acceptedBy }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, token] });
    },
  });
}

export function useRejectPublicQuote(token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      apiClient.post<PublicQuote>(`/public/quotes/${token}/reject`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, token] });
    },
  });
}

export function publicQuotePdfUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/public/quotes/${token}/pdf`;
}
