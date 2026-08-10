"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTenants } from "./use-auth";
import { useCurrentTenantId } from "./use-current-tenant";

/**
 * A normal login never establishes which tenant is "current" — only
 * registering a brand-new tenant (register-form.tsx) or explicitly picking
 * one (select-tenant/page.tsx, the header's tenant switcher) ever calls
 * `setCurrentTenantId`. A returning user whose localStorage tenant id is
 * missing or stale (cleared browser storage, a different device/browser, a
 * revoked membership) would otherwise silently keep sending every
 * tenant-scoped request to `/tenants/null/...` or a tenant they no longer
 * belong to — a 403 the generic error handler shows as "Something went
 * wrong," while list pages simply render their empty state because their
 * queries are `enabled: !!tenantId` and never even fire. This hook repairs
 * that on every app-shell mount: a single-tenant account is corrected
 * transparently; a multi-tenant account is sent to the existing picker.
 *
 * Returns whether tenant context is confirmed valid — callers should defer
 * rendering tenant-scoped children until this is true, so the correction
 * (or redirect) never has a chance to flash a misleading empty/error state.
 */
export function useEnsureTenantContext(): { ready: boolean } {
  const router = useRouter();
  const { data } = useTenants();
  const [tenantId, setCurrentTenantId] = useCurrentTenantId();

  const isValid =
    data !== undefined && tenantId !== null && data.tenants.some((t) => t.id === tenantId);

  useEffect(() => {
    if (!data || isValid) return;

    if (data.tenants.length === 1) {
      setCurrentTenantId(data.tenants[0]!.id);
    } else if (data.tenants.length > 1) {
      router.replace("/app/select-tenant");
    }
    // 0 tenants: nothing to select — an account with no active membership
    // is a broken/edge state outside this fix's scope; let the page render
    // and its own `enabled: !!tenantId` guards keep it inert rather than
    // crashing.
  }, [data, isValid, setCurrentTenantId, router]);

  if (!data) return { ready: false };
  if (isValid) return { ready: true };
  // Auto-selecting (1 tenant) or redirecting (2+ tenants) is in flight —
  // not ready yet. With 0 tenants there's nothing to wait for.
  return { ready: data.tenants.length === 0 };
}
