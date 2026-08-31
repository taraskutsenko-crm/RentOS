"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { TenantSignature } from "../types/document";

const BASE_KEY = "company-signature";

export function companySignatureFileUrl(tenantId: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/company-signature/file`;
}

export function useCompanySignature(tenantId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId],
    queryFn: () =>
      apiClient.get<{ signature: TenantSignature | null }>(
        `/tenants/${tenantId}/company-signature`,
      ),
    enabled: !!tenantId,
  });
}

export interface UploadCompanySignatureInput {
  file: File;
  representativeName: string;
  representativeTitle?: string;
  method: "DRAWN" | "UPLOADED";
}

export function useUploadCompanySignature(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadCompanySignatureInput) => {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("representativeName", input.representativeName);
      if (input.representativeTitle) {
        formData.append("representativeTitle", input.representativeTitle);
      }
      formData.append("method", input.method);
      return apiClient.postForm<TenantSignature>(
        `/tenants/${tenantId}/company-signature`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteCompanySignature(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/tenants/${tenantId}/company-signature`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
