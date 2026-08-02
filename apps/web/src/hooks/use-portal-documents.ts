"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  PaginatedPortalDocuments,
  PortalDocument,
  PortalDocumentPreview,
  PortalSignatureRequest,
} from "../types/portal";

export interface PortalDocumentListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  documentType?: string | undefined;
  status?: string | undefined;
  rentalId?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

const BASE_KEY = "portal-documents";

export function usePortalDocuments(params: PortalDocumentListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, params],
    queryFn: () => apiClient.get<PaginatedPortalDocuments>("/portal/documents", { ...params }),
  });
}

export function usePortalDocument(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "detail", id],
    queryFn: () => apiClient.get<PortalDocument>(`/portal/documents/${id}`),
    enabled: !!id,
  });
}

export function usePortalDocumentPreview(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "preview", id],
    queryFn: () => apiClient.get<PortalDocumentPreview>(`/portal/documents/${id}/preview`),
    enabled: !!id,
  });
}

export function portalDocumentPdfUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/documents/${id}/pdf`;
}

export function usePortalDocumentSignatureRequests(id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, "signature-requests", id],
    queryFn: () =>
      apiClient.get<PortalSignatureRequest[]>(`/portal/documents/${id}/signature-requests`),
    enabled: !!id,
  });
}

export function useSignPortalDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      signatureRequestId,
    }: {
      documentId: string;
      signatureRequestId: string;
    }) =>
      apiClient.post<PortalSignatureRequest>(
        `/portal/documents/${documentId}/signature-requests/${signatureRequestId}/sign`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, "signature-requests", variables.documentId],
      });
    },
  });
}
