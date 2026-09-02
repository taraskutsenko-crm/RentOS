"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";

export type EmailStatus = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTION_TEST_FAILED" | "READY";

export interface EmailStatusView {
  status: EmailStatus;
  error?: string;
}

export interface TestEmailResult {
  success: boolean;
  /** Already-sanitized, never a raw SMTP/transport error — see EmailTestService. */
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

/** Task B4 — a real send through the tenant's configured provider, not a simulated/optimistic result. */
export function useSendTestEmail(tenantId: string | null) {
  return useMutation({
    mutationFn: (recipientEmail: string) =>
      apiClient.post<TestEmailResult>(`/tenants/${tenantId}/integrations/email/test`, {
        recipientEmail,
      }),
  });
}
