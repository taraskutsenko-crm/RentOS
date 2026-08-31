"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { Tenant } from "../types/auth";

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — unlike the signature
 * system (a separate TenantSignature record needing its own GET query), the
 * logo's metadata (logoMimeType/logoWidth/logoHeight) already lives right on
 * the Tenant object useCurrentTenantRole() reads — no dedicated metadata
 * query needed here, just invalidate that same ["tenants", tenantId, "role"]
 * key on upload/delete so the page re-fetches the current state.
 */
export function companyLogoFileUrl(tenantId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/company-logo/file`;
}

export function useUploadCompanyLogo(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.postForm<{ tenant: Tenant }>(
        `/tenants/${tenantId}/company-logo`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", tenantId, "role"] });
    },
  });
}

export function useDeleteCompanyLogo(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/tenants/${tenantId}/company-logo`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenants", tenantId, "role"] });
    },
  });
}
