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

/**
 * The tenant's own IANA timezone, for displaying Rental/Quote/Document
 * dates the same way regardless of which timezone the viewing browser
 * happens to be in — matching what quote-pdf.service.ts/variable-resolver
 * .service.ts already do server-side (see DECISIONS.md). `undefined` while
 * loading/absent lets every `formatDate`/`formatDateTime` call site fall
 * back to the browser's local timezone exactly as before this existed.
 */
export function useTenantTimezone(): string | undefined {
  const { data } = useCurrentTenantRole();
  return data?.tenant.timezone;
}
