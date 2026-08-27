"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";

export type EmailStatus = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTION_TEST_FAILED" | "READY";

export interface EmailStatusView {
  status: EmailStatus;
  error?: string;
}

/**
 * Honest email-provider status for Settings/Integrations — see
 * EmailStatusController. Never claims READY without a real connectivity
 * check having succeeded.
 */
export function useEmailStatus(tenantId: string | null) {
  return useQuery({
    queryKey: ["integrations", tenantId, "email-status"],
    queryFn: () => apiClient.get<EmailStatusView>(`/tenants/${tenantId}/integrations/email/status`),
    enabled: !!tenantId,
  });
}
