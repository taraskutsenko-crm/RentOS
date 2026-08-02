"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { PortalSession } from "../types/portal";

const ME_QUERY_KEY = ["portal", "auth", "me"];

export function usePortalMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient.get<PortalSession>("/portal/auth/me"),
    retry: false,
  });
}

export function usePortalLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tenantSlug: string; email: string; password: string }) =>
      apiClient.post<PortalSession>("/portal/auth/login", input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

export function usePortalActivateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      apiClient.post<PortalSession>("/portal/auth/activate-invitation", input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });
}

export function usePortalLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>("/portal/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
