"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  CreatedDocumentShareLink,
  DocumentEmailDelivery,
  DocumentEmailRecipientType,
  DocumentPreview,
  DocumentShareLink,
  DocumentSignatureRequest,
  DocumentStatus,
  DocumentTimelineEvent,
  DocumentType,
  PaginatedDocuments,
  RentOSDocument,
} from "../types/document";

export interface DocumentListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  documentType?: DocumentType | undefined;
  status?: DocumentStatus | undefined;
  customerId?: string | undefined;
  rentalId?: string | undefined;
  quoteId?: string | undefined;
  assetId?: string | undefined;
  createdByUserId?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

export interface DocumentItemInput {
  assetId?: string | undefined;
  rentalItemId?: string | undefined;
  description?: string | null | undefined;
  data?: Record<string, unknown> | undefined;
  sortOrder?: number | undefined;
}

export interface DocumentInput {
  documentType: DocumentType;
  customTypeName?: string | undefined;
  title?: string | null | undefined;
  customerId?: string | undefined;
  rentalId?: string | undefined;
  quoteId?: string | undefined;
  assetId?: string | undefined;
  employeeUserId?: string | undefined;
  businessData?: Record<string, unknown> | undefined;
  items?: DocumentItemInput[] | undefined;
}

const BASE_KEY = "documents";

export function useDocuments(tenantId: string | null, params: DocumentListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, params],
    queryFn: () =>
      apiClient.get<PaginatedDocuments>(`/tenants/${tenantId}/documents`, { ...params }),
    enabled: !!tenantId,
  });
}

export function useDocument(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "detail", id],
    queryFn: () => apiClient.get<RentOSDocument>(`/tenants/${tenantId}/documents/${id}`),
    enabled: !!tenantId && !!id,
  });
}

/**
 * Real tenant-wide document counts for the Documents Workspace's Smart
 * Summary, composed from the existing list endpoint's `.total` the same
 * way `useDashboardStats` does (`pageSize:1`, read `.total`) — no
 * dedicated backend aggregation endpoint exists or is needed for this.
 * See docs/UI_REDESIGN_PLAN.md Chapter 9, design decision 2.
 */
export function useDocumentsSummary(tenantId: string | null) {
  const totalQuery = useDocuments(tenantId, { pageSize: 1 });
  const draftQuery = useDocuments(tenantId, { pageSize: 1, status: "DRAFT" });
  const sentQuery = useDocuments(tenantId, { pageSize: 1, status: "SENT" });
  const viewedQuery = useDocuments(tenantId, { pageSize: 1, status: "VIEWED" });
  const signedQuery = useDocuments(tenantId, { pageSize: 1, status: "SIGNED" });
  const partiallySignedQuery = useDocuments(tenantId, {
    pageSize: 1,
    status: "PARTIALLY_SIGNED",
  });

  const queries = [
    totalQuery,
    draftQuery,
    sentQuery,
    viewedQuery,
    signedQuery,
    partiallySignedQuery,
  ];

  return {
    total: totalQuery.data?.total ?? 0,
    draft: draftQuery.data?.total ?? 0,
    sent: (sentQuery.data?.total ?? 0) + (viewedQuery.data?.total ?? 0),
    signed: (signedQuery.data?.total ?? 0) + (partiallySignedQuery.data?.total ?? 0),
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
  };
}

export function useDocumentTimeline(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "history", id],
    queryFn: () =>
      apiClient.get<DocumentTimelineEvent[]>(`/tenants/${tenantId}/documents/${id}/history`),
    enabled: !!tenantId && !!id,
  });
}

export function useDocumentPreview(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "preview", id],
    queryFn: () => apiClient.get<DocumentPreview>(`/tenants/${tenantId}/documents/${id}/preview`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentInput) =>
      apiClient.post<RentOSDocument>(`/tenants/${tenantId}/documents`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DocumentInput> }) =>
      apiClient.patch<RentOSDocument>(`/tenants/${tenantId}/documents/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeleteDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/documents/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useCreateDocumentVersion(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      businessData,
    }: {
      id: string;
      reason: string;
      businessData?: Record<string, unknown> | undefined;
    }) =>
      apiClient.post<RentOSDocument>(`/tenants/${tenantId}/documents/${id}/versions`, {
        reason,
        businessData,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.id],
      });
    },
  });
}

function useDocumentLifecycleAction<TResult = RentOSDocument>(
  tenantId: string | null,
  action: "ready" | "send" | "viewed" | "reject" | "void" | "archive" | "duplicate",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      apiClient.post<TResult>(`/tenants/${tenantId}/documents/${id}/${action}`, { reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.id],
      });
    },
  });
}

export function useMarkDocumentReady(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "ready");
}

export function useMarkDocumentSent(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "send");
}

export function useMarkDocumentViewed(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "viewed");
}

export function useRejectDocument(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "reject");
}

export function useVoidDocument(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "void");
}

export function useArchiveDocument(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "archive");
}

export function useDuplicateDocument(tenantId: string | null) {
  return useDocumentLifecycleAction(tenantId, "duplicate");
}

export function useSignDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      full = true,
      reason,
    }: {
      id: string;
      full?: boolean | undefined;
      reason?: string | undefined;
    }) =>
      apiClient.post<RentOSDocument>(`/tenants/${tenantId}/documents/${id}/sign?full=${full}`, {
        reason,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.id],
      });
    },
  });
}

export function useRegenerateDocumentPdf(tenantId: string | null) {
  return useMutation({
    mutationFn: (id: string) => apiClient.post<void>(`/tenants/${tenantId}/documents/${id}/pdf`),
  });
}

export function documentPdfUrl(tenantId: string | null, id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/documents/${id}/pdf`;
}

// ---------------------------------------------------------------------
// Sharing (Part 4)
// ---------------------------------------------------------------------

export function useDocumentShareLinks(tenantId: string | null, documentId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "share", documentId],
    queryFn: () =>
      apiClient.get<DocumentShareLink[]>(`/tenants/${tenantId}/documents/${documentId}/share`),
    enabled: !!tenantId && !!documentId,
  });
}

export function useCreateDocumentShareLink(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      expiresInDays,
      password,
    }: {
      documentId: string;
      expiresInDays?: number | undefined;
      password?: string | undefined;
    }) =>
      apiClient.post<CreatedDocumentShareLink>(
        `/tenants/${tenantId}/documents/${documentId}/share`,
        {
          expiresInDays,
          password,
        },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "share", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

export function useDisableDocumentShareLink(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, shareLinkId }: { documentId: string; shareLinkId: string }) =>
      apiClient.delete<void>(`/tenants/${tenantId}/documents/${documentId}/share/${shareLinkId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "share", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

// ---------------------------------------------------------------------
// Email (Part 5)
// ---------------------------------------------------------------------

export function useDocumentEmailDeliveries(tenantId: string | null, documentId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "email", documentId],
    queryFn: () =>
      apiClient.get<DocumentEmailDelivery[]>(`/tenants/${tenantId}/documents/${documentId}/email`),
    enabled: !!tenantId && !!documentId,
  });
}

export function useSendDocumentEmail(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      recipientType,
      customEmail,
      subject,
      message,
    }: {
      documentId: string;
      recipientType: DocumentEmailRecipientType;
      customEmail?: string | undefined;
      subject: string;
      message?: string | null | undefined;
    }) =>
      apiClient.post<DocumentEmailDelivery>(`/tenants/${tenantId}/documents/${documentId}/email`, {
        recipientType,
        customEmail,
        subject,
        message,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "email", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

export function useRetryDocumentEmail(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      emailDeliveryId,
    }: {
      documentId: string;
      emailDeliveryId: string;
    }) =>
      apiClient.post<DocumentEmailDelivery>(
        `/tenants/${tenantId}/documents/${documentId}/email/${emailDeliveryId}/retry`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "email", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

// ---------------------------------------------------------------------
// E-signature (Part 6)
// ---------------------------------------------------------------------

export function useDocumentSignatureRequests(tenantId: string | null, documentId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "signature-requests", documentId],
    queryFn: () =>
      apiClient.get<DocumentSignatureRequest[]>(
        `/tenants/${tenantId}/documents/${documentId}/signature-requests`,
      ),
    enabled: !!tenantId && !!documentId,
  });
}

export function useRequestDocumentSignature(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      signerName,
      signerEmail,
    }: {
      documentId: string;
      signerName?: string | null | undefined;
      signerEmail?: string | null | undefined;
    }) =>
      apiClient.post<DocumentSignatureRequest>(
        `/tenants/${tenantId}/documents/${documentId}/signature-requests`,
        { signerName, signerEmail },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "signature-requests", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

function useDocumentSignatureAction(tenantId: string | null, action: "refresh" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      signatureRequestId,
    }: {
      documentId: string;
      signatureRequestId: string;
    }) =>
      apiClient.post<DocumentSignatureRequest>(
        `/tenants/${tenantId}/documents/${documentId}/signature-requests/${signatureRequestId}/${action}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "signature-requests", variables.documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "history", variables.documentId],
      });
    },
  });
}

export function useRefreshDocumentSignature(tenantId: string | null) {
  return useDocumentSignatureAction(tenantId, "refresh");
}

export function useCancelDocumentSignature(tenantId: string | null) {
  return useDocumentSignatureAction(tenantId, "cancel");
}
