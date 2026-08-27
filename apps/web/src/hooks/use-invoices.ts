"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  Invoice,
  InvoiceStatus,
  InvoiceType,
  PaginatedInvoices,
  PaymentMethod,
} from "../types/invoice";

const BASE_KEY = "invoices";

export interface InvoiceListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: InvoiceStatus | undefined;
  type?: InvoiceType | undefined;
  customerId?: string | undefined;
  rentalId?: string | undefined;
  sortBy?: string | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}

export interface InvoiceItemInput {
  description: string;
  quantity?: number | undefined;
  unit?: string | null | undefined;
  unitNetPriceMinor: number;
  discountMinor?: number | undefined;
  taxRateBp?: number | undefined;
  sourceRentalItemId?: string | undefined;
}

export interface CreateInvoiceInput {
  rentalId?: string | undefined;
  customerId?: string | undefined;
  type?: InvoiceType | undefined;
  issueDate?: string | undefined;
  saleDate?: string | undefined;
  dueDate?: string | undefined;
  currency?: string | undefined;
  bankAccountId?: string | null | undefined;
  notes?: string | null | undefined;
  items?: InvoiceItemInput[] | undefined;
}

export interface UpdateInvoiceInput {
  customerId?: string | undefined;
  issueDate?: string | undefined;
  saleDate?: string | null | undefined;
  dueDate?: string | null | undefined;
  currency?: string | undefined;
  bankAccountId?: string | null | undefined;
  preferredPaymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | null | undefined;
  notes?: string | null | undefined;
  items?: InvoiceItemInput[] | undefined;
}

export function useInvoices(tenantId: string | null, params: InvoiceListParams = {}) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, params],
    queryFn: () => apiClient.get<PaginatedInvoices>(`/tenants/${tenantId}/invoices`, { ...params }),
    enabled: !!tenantId,
  });
}

export function useInvoice(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "detail", id],
    queryFn: () => apiClient.get<Invoice>(`/tenants/${tenantId}/invoices/${id}`),
    enabled: !!tenantId && !!id,
  });
}

/** The same HTML InvoicePdfService renders to PDF — backs the direct-print iframe (mirrors useDocumentPreview). */
export function useInvoicePreview(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, "preview", id],
    queryFn: () => apiClient.get<{ html: string }>(`/tenants/${tenantId}/invoices/${id}/preview`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateInvoice(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      apiClient.post<Invoice>(`/tenants/${tenantId}/invoices`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateInvoice(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInvoiceInput }) =>
      apiClient.patch<Invoice>(`/tenants/${tenantId}/invoices/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

function useInvoiceLifecycleAction(tenantId: string | null, action: "issue" | "send") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Invoice>(`/tenants/${tenantId}/invoices/${id}/${action}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useIssueInvoice(tenantId: string | null) {
  return useInvoiceLifecycleAction(tenantId, "issue");
}

export function useSendInvoice(tenantId: string | null) {
  return useInvoiceLifecycleAction(tenantId, "send");
}

export function useCancelInvoice(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string | undefined }) =>
      apiClient.post<Invoice>(`/tenants/${tenantId}/invoices/${id}/cancel`, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function invoicePdfUrl(tenantId: string | null, id: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/invoices/${id}/pdf`;
}
