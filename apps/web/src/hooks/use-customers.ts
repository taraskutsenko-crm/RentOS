"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  Customer,
  CustomerStatus,
  CustomerSummary,
  CustomerTimelineEvent,
  PaginatedCustomers,
} from "../types/customer";

export interface CustomerListParams {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: CustomerStatus | undefined;
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  company?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
  address?: string;
  notes?: string;
  status?: CustomerStatus;
}

function customersQueryKey(tenantId: string | null, params: CustomerListParams): unknown[] {
  return ["customers", tenantId, params];
}

export function useCustomers(tenantId: string | null, params: CustomerListParams = {}) {
  return useQuery({
    queryKey: customersQueryKey(tenantId, params),
    queryFn: () =>
      apiClient.get<PaginatedCustomers>(`/tenants/${tenantId}/customers`, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        status: params.status,
      }),
    enabled: !!tenantId,
  });
}

export function useCustomer(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["customers", tenantId, "detail", id],
    queryFn: () => apiClient.get<Customer>(`/tenants/${tenantId}/customers/${id}`),
    enabled: !!tenantId && !!id,
  });
}

export function useCustomerTimeline(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["customers", tenantId, "timeline", id],
    queryFn: () =>
      apiClient.get<CustomerTimelineEvent[]>(`/tenants/${tenantId}/customers/${id}/timeline`),
    enabled: !!tenantId && !!id,
  });
}

export function useCustomerSummary(tenantId: string | null, id: string | null) {
  return useQuery({
    queryKey: ["customers", tenantId, "summary", id],
    queryFn: () => apiClient.get<CustomerSummary>(`/tenants/${tenantId}/customers/${id}/summary`),
    enabled: !!tenantId && !!id,
  });
}

export function useCreateCustomer(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) =>
      apiClient.post<Customer>(`/tenants/${tenantId}/customers`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
    },
  });
}

export function useUpdateCustomer(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CustomerInput> }) =>
      apiClient.patch<Customer>(`/tenants/${tenantId}/customers/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
    },
  });
}

export function useDeleteCustomer(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/tenants/${tenantId}/customers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
    },
  });
}
