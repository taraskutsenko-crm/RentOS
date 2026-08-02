"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { CustomerNotification } from "../types/portal";

const BASE_KEY = "portal-notifications";

export function usePortalNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [BASE_KEY, unreadOnly],
    queryFn: () => apiClient.get<CustomerNotification[]>("/portal/notifications", { unreadOnly }),
  });
}

export function usePortalUnreadNotificationCount() {
  return useQuery({
    queryKey: [BASE_KEY, "unread-count"],
    queryFn: () => apiClient.get<{ count: number }>("/portal/notifications/unread-count"),
    refetchInterval: 30_000,
  });
}

export function useMarkPortalNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<CustomerNotification>(`/portal/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });
}

export function useMarkAllPortalNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>("/portal/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
    },
  });
}
