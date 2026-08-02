"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { PortalDashboardSummary } from "../types/portal";

export function usePortalDashboard() {
  return useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: () => apiClient.get<PortalDashboardSummary>("/portal/dashboard"),
  });
}
