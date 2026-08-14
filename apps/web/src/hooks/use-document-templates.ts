"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  DocumentTemplate,
  DocumentTemplateStatus,
  DocumentType,
  PaginatedDocumentTemplates,
} from "../types/document";

export interface DocumentTemplateListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  documentType?: DocumentType | undefined;
  status?: DocumentTemplateStatus | undefined;
}

export interface CreateDocumentTemplateInput {
  documentType: DocumentType;
  name: string;
  description?: string | null | undefined;
  htmlContent: string;
  css?: string | null | undefined;
  variablesSchema?: Record<string, unknown> | undefined;
}

export interface UpdateDocumentTemplateInput {
  name?: string | undefined;
  description?: string | null | undefined;
}

export interface UpdateDocumentTemplateContentInput {
  htmlContent: string;
  css?: string | null | undefined;
  variablesSchema?: Record<string, unknown> | undefined;
}

export interface PreviewDocumentTemplateInput {
  documentType: DocumentType;
  htmlContent: string;
  css?: string | null | undefined;
}

const BASE_KEY = "document-templates";

export function useDocumentTemplates(
  tenantId: string | null,
  params: DocumentTemplateListParams = {},
) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, params],
    queryFn: () =>
      apiClient.get<PaginatedDocumentTemplates>(`/tenants/${tenantId}/document-templates`, {
        ...params,
      }),
    enabled: !!tenantId,
  });
}

export function useDocumentTemplate(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "detail", id],
    queryFn: () => apiClient.get<DocumentTemplate>(`/tenants/${tenantId}/document-templates/${id}`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateDocumentTemplate(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDocumentTemplateInput) =>
      apiClient.post<DocumentTemplate>(`/tenants/${tenantId}/document-templates`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateDocumentTemplateMeta(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentTemplateInput }) =>
      apiClient.patch<DocumentTemplate>(`/tenants/${tenantId}/document-templates/${id}`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "detail", variables.id],
      });
    },
  });
}

export function useUpdateDocumentTemplateContent(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDocumentTemplateContentInput }) =>
      apiClient.post<DocumentTemplate>(
        `/tenants/${tenantId}/document-templates/${id}/versions`,
        input,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "detail", variables.id],
      });
    },
  });
}

export function useRestoreDocumentTemplateVersion(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionNumber }: { id: string; versionNumber: number }) =>
      apiClient.post<DocumentTemplate>(
        `/tenants/${tenantId}/document-templates/${id}/versions/${versionNumber}/restore`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, tenantId, "detail", variables.id],
      });
    },
  });
}

function useDocumentTemplateAction<TResult = DocumentTemplate>(
  tenantId: string | null,
  action: "activate" | "archive" | "restore" | "duplicate",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<TResult>(`/tenants/${tenantId}/document-templates/${id}/${action}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, "detail", id] });
    },
  });
}

export function useActivateDocumentTemplate(tenantId: string | null) {
  return useDocumentTemplateAction(tenantId, "activate");
}

export function useArchiveDocumentTemplate(tenantId: string | null) {
  return useDocumentTemplateAction(tenantId, "archive");
}

export function useRestoreDocumentTemplate(tenantId: string | null) {
  return useDocumentTemplateAction(tenantId, "restore");
}

export function useDuplicateDocumentTemplate(tenantId: string | null) {
  return useDocumentTemplateAction(tenantId, "duplicate");
}

/**
 * Renders unsaved draft HTML/CSS against synthetic sample data — the
 * no-code builder's "preview" action, usable before the template (or even
 * this version) has ever been saved. Not a query: the caller triggers it
 * on demand (a "Refresh preview" action), not on every keystroke.
 */
export function usePreviewDocumentTemplate(tenantId: string | null) {
  return useMutation({
    mutationFn: (input: PreviewDocumentTemplateInput) =>
      apiClient.post<{ html: string }>(`/tenants/${tenantId}/document-templates/preview`, input),
  });
}
