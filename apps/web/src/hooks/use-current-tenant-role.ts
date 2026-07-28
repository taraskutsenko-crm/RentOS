"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import { roleHasPermission, type Permission } from "../lib/permissions";
import type { MembershipRole, Tenant } from "../types/auth";
import { useCurrentTenantId } from "./use-current-tenant";

export function useCurrentTenantRole() {
  const [tenantId] = useCurrentTenantId();

  return useQuery({
    queryKey: ["tenants", tenantId, "role"],
    queryFn: () => apiClient.get<{ tenant: Tenant; role: MembershipRole }>(`/tenants/${tenantId}`),
    enabled: !!tenantId,
  });
}

/** UX convenience only — see lib/permissions.ts. The API is the real gate. */
export function usePermission(permission: Permission): boolean {
  const { data } = useCurrentTenantRole();
  return roleHasPermission(data?.role, permission);
}
