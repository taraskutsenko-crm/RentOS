"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { CompanyBankAccount } from "../types/bank-account";

const BASE_KEY = "bank-accounts";

export interface BankAccountInput {
  label: string;
  bankName?: string | null | undefined;
  accountHolder?: string | null | undefined;
  accountNumber?: string | null | undefined;
  iban?: string | null | undefined;
  swiftBic?: string | null | undefined;
  currency: string;
  bankAddress?: string | null | undefined;
  paymentReference?: string | null | undefined;
  isDefault?: boolean | undefined;
}

export function useBankAccounts(tenantId: string | null, includeInactive = false) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, includeInactive],
    queryFn: () =>
      apiClient.get<CompanyBankAccount[]>(`/tenants/${tenantId}/bank-accounts`, {
        includeInactive: includeInactive ? "true" : undefined,
      }),
    enabled: !!tenantId,
  });
}

export function useCreateBankAccount(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BankAccountInput) =>
      apiClient.post<CompanyBankAccount>(`/tenants/${tenantId}/bank-accounts`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useUpdateBankAccount(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<BankAccountInput> & { isActive?: boolean | undefined };
    }) => apiClient.patch<CompanyBankAccount>(`/tenants/${tenantId}/bank-accounts/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}

export function useDeactivateBankAccount(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<CompanyBankAccount>(`/tenants/${tenantId}/bank-accounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
