"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type { MembershipRole, Tenant, User } from "../types/auth";

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  countryCode: string;
  defaultLanguage: string;
  defaultCurrency: string;
  timezone: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

const ME_QUERY_KEY = ["auth", "me"];
const TENANTS_QUERY_KEY = ["tenants"];

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient.get<{ user: User }>("/auth/me"),
    retry: false,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiClient.post<{ user: User; tenant: Tenant }>("/auth/register", input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, { user: data.user });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => apiClient.post<{ user: User }>("/auth/login", input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, { user: data.user });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useTenants() {
  return useQuery({
    queryKey: TENANTS_QUERY_KEY,
    queryFn: () => apiClient.get<{ tenants: Tenant[] }>("/tenants"),
  });
}

export function useSelectTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.post<{ tenant: Tenant; role: MembershipRole }>(`/tenants/${tenantId}/select`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TENANTS_QUERY_KEY });
    },
  });
}
