"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  MonthlyBillingStrategy,
  PartialMonthPolicy,
  RentalBillingSettings,
} from "../types/rental";

export interface RentalBillingSettingsInput {
  monthlyBillingStrategy: MonthlyBillingStrategy;
  customMonthLengthDays?: number | null;
  partialMonthPolicy: PartialMonthPolicy;
}

const BASE_KEY = "rental-billing-settings";

export function useRentalBillingSettings(tenantId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId],
    queryFn: () =>
      apiClient.get<RentalBillingSettings>(`/tenants/${tenantId}/rental-billing-settings`),
    enabled: !!tenantId,
  });
}

export function useUpdateRentalBillingSettings(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RentalBillingSettingsInput) =>
      apiClient.patch<RentalBillingSettings>(`/tenants/${tenantId}/rental-billing-settings`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId] });
    },
  });
}
