"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { Tenant } from "../types/auth";

export interface CompanyProfileInput {
  name: string;
  timezone: string;
  registrationNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
}

/** Powers the Company Profile settings page — PATCHes the same resource useCurrentTenantRole() reads. */
export function useUpdateCompanyProfile(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyProfileInput) =>
      apiClient.patch<{ tenant: Tenant }>(`/tenants/${tenantId}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", tenantId, "role"] });
    },
  });
}
