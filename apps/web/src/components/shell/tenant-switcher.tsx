"use client";

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rentos/ui";
import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useSelectTenant, useTenants } from "../../hooks/use-auth";
import { useCurrentTenantId } from "../../hooks/use-current-tenant";
import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";

/**
 * Fast, minimal in-header tenant switcher — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1, decision 6. Reuses the exact
 * useTenants/useSelectTenant/useCurrentTenantId hooks the standalone
 * /app/select-tenant page already uses; that page remains for the
 * zero-tenant-selected case, this control replaces it for the common
 * case of switching while already inside the app.
 */
export function TenantSwitcher() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId, setTenantId] = useCurrentTenantId();
  const { data: currentTenant } = useCurrentTenantRole();
  const { data: tenantsData } = useTenants();
  const selectTenant = useSelectTenant();

  const tenants = tenantsData?.tenants ?? [];
  const currentName = currentTenant?.tenant.name ?? "";

  async function handleSwitch(id: string): Promise<void> {
    if (id === tenantId) return;
    await selectTenant.mutateAsync(id);
    setTenantId(id);
    // A record on the previous page may not exist in the new tenant —
    // returning to a safe, tenant-agnostic screen avoids a confusing 404.
    router.push("/app");
  }

  if (tenants.length <= 1) {
    return <span className="truncate text-sm font-medium">{currentName}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-neutral-50 dark:hover:bg-neutral-800 flex max-w-40 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="truncate">{currentName}</span>
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t("tenant.selectTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onSelect={() => void handleSwitch(tenant.id)}
            className={cn("justify-between", tenant.id === tenantId && "font-medium")}
          >
            <span className="truncate">{tenant.name}</span>
            {tenant.id === tenantId && (
              <Check className="text-primary size-4 shrink-0" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
